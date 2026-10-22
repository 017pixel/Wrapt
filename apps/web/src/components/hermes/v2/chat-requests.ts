import type { ChatRuntime } from "./chat-runtime";
import type { OwnerCapture } from "./chat-owners";
import type { ChatRequestState, HermesV2Request, HermesV2Response } from "./chat-types";
import { ChatError, errorInfo } from "./gateway-protocol";
import { chatPolicy } from "./chat-policy";
import { requestResponse } from "./chat-request-response";

interface Entry extends ChatRequestState { questionId: string | null; confirmed: boolean }
type Payload = { response: HermesV2Response } | { questionId: string; answer: string | null };
const identity = (key: string, epoch: string) => JSON.stringify([epoch, key]);

/** Lokale Klicksperre, keine zweite Core-Registry. Einträge enthalten keine Antworten. */
export class ChatRequests {
  private entries = new Map<string, Entry>();
  constructor(private readonly runtime: ChatRuntime) {}
  states(sessionId: string | null): readonly ChatRequestState[] {
    const state = sessionId ? this.runtime.store.peek(sessionId) : null;
    if (!state) return [];
    return [...this.entries.values()].filter((entry) => state.epoch === entry.epoch
      && state.requests.some((request) => request.key === entry.key && request.epoch === entry.epoch))
      .map(({ key, epoch, status }) => ({ key, epoch, status }));
  }
  dispose(): void { this.entries.clear(); }
  respond(id: string, request: HermesV2Request, response: HermesV2Response): Promise<void> {
    return this.perform(id, request, { response });
  }
  lock(id: string, request: HermesV2Request, questionId: string, answer: string | null): Promise<void> {
    return this.perform(id, request, { questionId, answer });
  }
  closed(key: string, epoch: string): void {
    this.entries.delete(identity(key, epoch));
    // Derselbe opaque Request kann unter Root und Tip sichtbar sein.
    for (const id of this.sessionIds()) {
      const state = this.runtime.store.peek(id);
      if (state?.requests.some((request) => request.key === key && request.epoch === epoch)) {
        this.runtime.store.update(id, (value) => ({ ...value, requests: value.requests.filter((request) => request.key !== key || request.epoch !== epoch) }));
      }
    }
    this.emit();
  }
  snapshot(before: readonly HermesV2Request[], after: readonly HermesV2Request[]): void {
    for (const request of before) if (!after.some((item) => item.key === request.key && item.epoch === request.epoch)) this.closed(request.key, request.epoch);
    for (const request of after) {
      const entry = this.entries.get(identity(request.key, request.epoch));
      if (entry?.questionId && (entry.confirmed || entry.status === "unknown") && request.kind === "clarify"
        && Object.hasOwn(request.lockedAnswers, entry.questionId)
        && request.questions.some((question) => !Object.hasOwn(request.lockedAnswers, question.id))) this.remove(entry);
    }
    this.emit();
  }
  private async perform(id: string, request: HermesV2Request, payload: Payload | null): Promise<void> {
    let capture: OwnerCapture | undefined, entry: Entry | undefined;
    let accepted = false;
    try {
      capture = this.runtime.owners.capture(id);
      this.current(capture, request);
      this.ready(capture);
      const key = identity(request.key, request.epoch);
      const existing = this.entries.get(key);
      if (existing) throw new ChatError(existing.status === "unknown" ? "UNKNOWN_REQUEST" : "REQUEST_PENDING", "Diese Anfrage wird bereits beantwortet.", existing.status === "unknown" ? "unknown" : "not_sent");
      if (this.entries.size >= chatPolicy.maxPending) throw new ChatError("CLIENT_BUSY", "Zu viele offene Anfrageaktionen.");
      entry = { key: request.key, epoch: request.epoch, status: "pending", questionId: payload && "questionId" in payload ? payload.questionId : null, confirmed: false };
      capture.draft.error = null;
      this.entries.set(key, entry); this.emit();
      await this.prepare(capture, request);
      if (!this.owns(entry)) return;
      if (!payload) return;
      const current = this.current(capture, request);
      this.ready(capture);
      let response: Promise<unknown>;
      if ("response" in payload) {
        const value = requestResponse(current, payload.response);
        response = this.runtime.client.request({ op: "request.respond", sessionId: capture.sessionId!, requestKey: current.key, epoch: current.epoch, response: value });
      } else {
        const questionId = payload.questionId;
        if (current.kind !== "clarify" || !current.questions.some((question) => question.id === questionId)
          || Object.hasOwn(current.lockedAnswers, questionId)) throw new ChatError("STALE_REQUEST", "Diese Frage ist nicht mehr offen.");
        response = this.runtime.client.request({ op: "request.lock", sessionId: capture.sessionId!, requestKey: current.key, epoch: current.epoch,
          questionId: payload.questionId, answer: payload.answer });
      }
      payload = null;
      await response;
      accepted = true;
      if (!this.owns(entry)) return;
      entry.confirmed = true;
      // Nach Send gehört die Bestätigung dem Runtime, auch nach Ownerausstieg.
      const selected = this.sessionIds().find((sessionId) => this.runtime.sessionIsLeased(sessionId)
        && this.runtime.store.peek(sessionId)?.requests.some((value) => value.key === entry!.key && value.epoch === entry!.epoch));
      if (selected && this.owns(entry)) await this.runtime.ensureSubscribed(selected, true);
      if (this.owns(entry)) this.snapshot([], selected ? this.runtime.store.peek(selected)?.requests ?? [] : []);
    } catch (error) {
      const info = errorInfo(error);
      const report = !entry || (this.owns(entry) && capture?.sessionId
        && this.runtime.store.peek(capture.sessionId)?.epoch === entry.epoch
        && this.runtime.store.peek(capture.sessionId)?.requests.some((value) => value.key === entry!.key && value.epoch === entry!.epoch));
      if (entry && this.owns(entry)) {
        if (accepted || info.outcome === "unknown") { entry.status = "unknown"; this.emit(); }
        else this.remove(entry);
      }
      if (report && capture && this.runtime.enabled() && this.runtime.owners.valid(capture)) {
        const messages: Record<string, string> = {
          STALE_REQUEST: "Diese Anfrage ist nicht mehr aktuell. Bitte den Chat abgleichen.",
          REQUEST_CLAIMED: "Diese Anfrage wird bereits an anderer Stelle beantwortet. Bitte den Chat abgleichen.",
          REQUEST_PENDING: "Diese Anfrage wird bereits beantwortet.",
          UNKNOWN_REQUEST: "Der Antwortausgang ist unklar. Bitte abgleichen oder die klassische Oberfläche nutzen.",
        };
        capture.draft.error = { code: info.code, outcome: accepted ? "unknown" : info.outcome,
          message: messages[info.code] ?? "Die Anfrage konnte nicht sicher abgeschlossen werden. Bitte den aktuellen Stand abgleichen." };
        this.runtime.owners.emit(capture.owner);
      }
    }
  }
  private current(capture: OwnerCapture, request: HermesV2Request): HermesV2Request {
    this.runtime.owners.assert(capture);
    if (!this.runtime.enabled() || capture.owner.options.active === false || capture.owner.options.visible === false
      || (typeof document !== "undefined" && document.visibilityState === "hidden")) throw new ChatError("OWNER_HIDDEN", "Diese Hermes-Fläche ist nicht sichtbar.");
    const state = capture.sessionId ? this.runtime.store.peek(capture.sessionId) : null;
    const current = state?.epoch === request.epoch ? state.requests.find((value) => value.key === request.key && value.epoch === request.epoch) : null;
    if (!capture.sessionId || request.sessionId !== capture.sessionId || current?.sessionId !== capture.sessionId
      || current.kind !== request.kind || current.method !== request.method) throw new ChatError("STALE_REQUEST", "Diese Anfrage ist nicht mehr aktuell.");
    return current;
  }
  private ready(capture: OwnerCapture): void {
    const state = capture.sessionId ? this.runtime.store.peek(capture.sessionId) : null;
    if (!state || state.loading || !state.writable || !this.runtime.sessionIsSynced(capture.sessionId!)
      || this.runtime.client.getSnapshot().state !== "online") throw new ChatError("SESSION_UNAVAILABLE", "Diese Sitzung wird noch abgeglichen.");
  }
  private async prepare(capture: OwnerCapture, request: HermesV2Request): Promise<HermesV2Request> {
    for (let attempt = 0; attempt < 3; attempt++) {
      this.current(capture, request);
      await this.runtime.ensureSubscribed(capture.sessionId!);
      this.current(capture, request);
      const generation = this.runtime.client.generation;
      await this.runtime.client.ready(true);
      const current = this.current(capture, request);
      const state = this.runtime.store.peek(capture.sessionId!)!;
      if (generation === this.runtime.client.generation && this.runtime.sessionIsSynced(capture.sessionId!)) {
        if (state.loading || !state.writable) throw new ChatError("SESSION_UNAVAILABLE", "Diese Sitzung ist nicht schreibbar.");
        return current;
      }
    }
    throw new ChatError("CLIENT_BUSY", "Hermes wird noch abgeglichen.");
  }
  private owns(entry: Entry): boolean { return this.runtime.enabled() && this.entries.get(identity(entry.key, entry.epoch)) === entry; }
  private remove(entry: Entry): void {
    if (this.entries.get(identity(entry.key, entry.epoch)) !== entry) return;
    this.entries.delete(identity(entry.key, entry.epoch)); this.emit();
  }
  private sessionIds(): string[] { return [...new Set([...this.runtime.owners.records.values()].filter((owner) => owner.mounted && owner.sessionId).map((owner) => owner.sessionId!))]; }
  private emit(): void { for (const owner of this.runtime.owners.records.values()) if (owner.mounted) this.runtime.owners.emit(owner); }
}
