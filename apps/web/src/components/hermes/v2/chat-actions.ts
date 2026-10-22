import type { ChatRuntime } from "./chat-runtime";
import type { OwnerCapture, DraftState } from "./chat-owners";
import type { CreateChatSession, HermesV2ChatActions, HermesV2Selection } from "./chat-types";
import { ChatError, errorInfo, isPriority, type GatewayOperation } from "./gateway-protocol";
import { applyChatHistory, applySubmitReceipt, optimisticUser, removeOptimisticUser } from "./chat-state";
import { chatPolicy } from "./chat-policy";
import { composerReady } from "./chat-composer-guards";
import type { WorkTicket } from "./chat-work-actions";
import type { ChatApprovalMode } from "./chat-composer-types";

const unknownWarning = "Die Aktion wurde möglicherweise bereits ausgeführt. Erneutes Senden kann eine doppelte Wirkung auslösen.";
export class ChatActions {
  private historyReads = new Map<string, Promise<void>>();
  private stopPending = new WeakMap<DraftState, Promise<void>>();
  private approvalPending = new WeakSet<DraftState>();
  constructor(private readonly runtime: ChatRuntime) {}
  forOwner(id: string): HermesV2ChatActions {
    return {
      setDraft: (text) => this.runtime.owners.setDraft(id, text),
      selectSession: (sessionId) => this.runtime.owners.select(this.runtime.owners.capture(id).owner, sessionId),
      refreshSessions: (query) => this.ui(id, () => this.runtime.refreshSessions(query)),
      createSession: (options) => this.create(id, options),
      submit: (text, mode) => this.ui(id, () => this.submit(id, text, mode)),
      stop: () => this.ui(id, () => this.stop(id)),
      steer: (text) => this.runtime.work.actions.run(id, "steer", null, text),
      refreshWork: () => this.runtime.work.reads.refresh(id),
      interruptSubagent: (target) => this.runtime.work.actions.run(id, "subagent.interrupt", target, null),
      readSubagentTail: (target) => this.runtime.work.actions.run(id, "subagent.tail", target, null),
      killProcess: (target) => this.runtime.work.actions.run(id, "process.kill", target, null),
      startBackground: (text) => this.runtime.work.actions.run(id, "background", null, text),
      startBtw: (text) => this.runtime.work.actions.run(id, "btw", null, text),
      loadOlder: () => this.ui(id, () => this.history(this.runtime.owners.capture(id))),
      readCatalog: () => this.ui(id, () => this.catalog(id)),
      selectModel: (selection, confirmed) => this.ui(id, () => this.model(id, selection, confirmed)),
      cancelModelSelection: () => this.runtime.composer.cancelModel(id),
      setTitle: (title) => this.runtime.composer.title(id, title),
      selectReasoning: (effort) => this.runtime.composer.reasoning(id, effort),
      setApprovalMode: (mode) => this.ui(id, () => this.approvals(id, mode)),
      uploadAttachment: (file) => this.runtime.attachments.upload(id, file),
      removeAttachment: (uploadId) => this.runtime.attachments.remove(id, uploadId),
      checkUpload: (uploadId) => this.runtime.attachments.check(id, uploadId),
      respond: (request, response) => this.runtime.requests.respond(id, request, response),
      lockRequest: (request, questionId, answer) => this.runtime.requests.lock(id, request, questionId, answer),
      resync: () => this.ui(id, () => this.runtime.resync(this.runtime.owners.capture(id).owner)),
      resendUnknown: (options) => this.ui(id, async () => {
        const capture = this.runtime.owners.capture(id);
        const unknown = capture.draft.unknown;
        if (!options.acknowledgeDuplicateRisk || !unknown?.resynced || !unknown.canResend || unknown.text === null) {
          throw new ChatError("RESYNC_REQUIRED", "Vor erneutem Senden bitte abgleichen und die mögliche Doppelwirkung bestätigen.");
        }
        await this.submit(id, unknown.text, unknown.mode, true);
      }),
      continueWithoutResend: () => this.ui(id, async () => {
        const capture = this.runtime.owners.capture(id);
        const unknown = capture.draft.unknown;
        this.assert(capture);
        if (!unknown) return;
        if (unknown.ownerGeneration === capture.generation && unknown.draftVersion === capture.draft.version
          && unknown.text !== null && capture.draft.text === unknown.text) {
          capture.draft.text = "";
          capture.draft.composer.attachments = capture.draft.composer.attachments.filter((entry) => !entry.attachment || !unknown.attachmentIds?.includes(entry.attachment.id));
          capture.draft.version++;
        }
        capture.draft.unknown = null;
        capture.draft.error = null;
        this.emit(capture);
      }),
      reconnect: () => { this.runtime.owners.capture(id); if (this.runtime.enabled()) this.runtime.client.reconnect(); },
      clearError: () => {
        const capture = this.runtime.owners.capture(id);
        capture.draft.error = null;
        this.runtime.owners.emit(capture.owner);
      },
    };
  }
  private async ui(id: string, action: () => Promise<void>): Promise<void> {
    let capture: OwnerCapture | undefined;
    try { capture = this.runtime.owners.capture(id); await action(); }
    catch (error) {
      if (capture) { capture.draft.error = errorInfo(error); this.emit(capture); }
    }
  }
  async history(capture: OwnerCapture, latestOnly = false): Promise<void> {
    const id = this.sessionId(capture);
    const running = this.historyReads.get(id);
    if (running) { await running; if (latestOnly) return this.history(capture, true); return; }
    const task = this.loadHistory(id, latestOnly).finally(() => { if (this.historyReads.get(id) === task) this.historyReads.delete(id); });
    this.historyReads.set(id, task);
    return task;
  }
  async refreshEvidence(capture: OwnerCapture, offsets: readonly number[]): Promise<void> {
    const id = this.sessionId(capture);
    const generation = this.runtime.store.get(id).generation;
    const valid = () => this.runtime.owners.valid(capture) && this.runtime.store.get(id).generation === generation;
    for (const offset of new Set(offsets)) {
      this.assert(capture);
      const result = await this.runtime.read({ op: "history.read", sessionId: id, limit: chatPolicy.historyPage, offset }, valid);
      this.assert(capture);
      if (!valid()) return;
      this.runtime.store.update(id, (state) => applyChatHistory(state, result.data.messages, offset, result.data.returned, result.data.hasMore));
    }
  }
  private async loadHistory(id: string, latestOnly: boolean): Promise<void> {
    const before = this.runtime.store.get(id);
    if (!latestOnly && before.history.length >= chatPolicy.maxMessages) {
      this.runtime.store.update(id, (state) => ({ ...state, hasOlder: false, error: {
        code: "HISTORY_LIMIT", message: "Die Anzeige ist auf 4000 Nachrichten begrenzt.", outcome: "not_sent",
      } }));
      return;
    }
    const generation = before.generation;
    const valid = () => this.runtime.sessionIsLeased(id) && this.runtime.store.get(id).generation === generation;
    this.runtime.store.update(id, (state) => ({ ...state, loadingOlder: true }));
    try {
      // Snapshot hat keinen Raw-Offset. Erst die echte erste History-Seite primt ihn.
      const prime = latestOnly || !before.historyPrimed;
      const offset = prime ? 0 : before.historyOffset;
      const result = await this.runtime.read({ op: "history.read", sessionId: id, limit: chatPolicy.historyPage, offset }, valid);
      if (!valid()) throw new ChatError("STALE_READ", "Die Historie wurde durch einen neuen Abgleich ersetzt.");
      this.runtime.store.update(id, (state) => applyChatHistory(state, result.data.messages, result.data.offset, result.data.returned, result.data.hasMore));
      if (prime && !latestOnly && result.data.hasMore) {
        const older = await this.runtime.read({ op: "history.read", sessionId: id, limit: chatPolicy.historyPage,
          offset: result.data.offset + result.data.returned }, valid);
        if (!valid()) throw new ChatError("STALE_READ", "Die Historie wurde durch einen neuen Abgleich ersetzt.");
        this.runtime.store.update(id, (state) => applyChatHistory(state, older.data.messages, older.data.offset, older.data.returned, older.data.hasMore));
      }
    } catch (error) {
      // Der UI-Aktionspfad zeigt diesen Lesefehler genau einmal als actionError.
      if (valid()) this.runtime.store.update(id, (state) => ({ ...state, loadingOlder: false }));
      throw error;
    }
  }
  private async create(id: string, options: CreateChatSession): Promise<string> {
    const capture = this.runtime.owners.capture(id);
    // Eine spätere neue Hostreferenz darf die Auswahl dieser Erstellung nicht übernehmen.
    const selectSession = capture.owner.options.onSelectSession;
    const selectionCurrent = () => capture.owner.options.onSelectSession === selectSession;
    try {
      await this.runtime.client.ready();
      this.assert(capture);
      if (!selectionCurrent()) throw new ChatError("OWNER_CHANGED", "Die Hermes-Auswahl wurde inzwischen geändert.");
      const result = await this.runtime.client.request({ op: "session.create", ...options });
      const sessionId = result.data.snapshot.session.id;
      if (this.runtime.owners.valid(capture) && this.runtime.enabled() && selectionCurrent()) {
        this.runtime.seed(result.data.snapshot);
        this.runtime.owners.select(capture.owner, sessionId);
      } else if (this.runtime.enabled() && !this.runtime.sessionIsLeased(sessionId)) {
        void this.runtime.read({ op: "session.unsubscribe", sessionId }).catch(() => {
          // Ein verlorener Browser-Attach endet ebenfalls beim Socket-Cleanup.
        });
      }
      return sessionId;
    } catch (error) { this.failure(capture, error, "session.create"); throw error; }
  }
  private async submit(id: string, supplied?: string, mode?: "normal" | "queue", acknowledged = false): Promise<void> {
    const capture = this.runtime.owners.capture(id);
    const sessionId = this.sessionId(capture);
    composerReady(this.runtime, capture, false);
    const text = supplied ?? capture.draft.text;
    if (mode === "queue" && this.runtime.work.actions.queuePending(capture.owner, text)) return;
    const attachments = this.runtime.attachments.ready(capture, acknowledged ? capture.draft.unknown?.attachmentIds ?? [] : undefined);
    const attachmentIds = attachments.map((entry) => entry.attachment!.id);
    if (!text.trim() && !attachmentIds.length) throw new ChatError("EMPTY_MESSAGE", "Bitte eine Nachricht eingeben.");
    if (text.length > chatPolicy.textLimit) throw new ChatError("PAYLOAD_TOO_LARGE", "Die Hermes-Nachricht ist zu lang.");
    if (capture.draft.submitting) throw new ChatError("SUBMIT_PENDING", "Diese Nachricht wird bereits gesendet.");
    if (capture.draft.unknown?.operation === "message.submit" && !acknowledged) {
      throw new ChatError("UNKNOWN_SEND", unknownWarning, "unknown");
    }
    const workTicket: WorkTicket | null = mode === "queue" ? this.runtime.work.actions.beginQueue(id, text) : null;
    capture.draft.submitting = true;
    capture.draft.error = null;
    this.runtime.owners.emit(capture.owner);
    const optimisticId = crypto.randomUUID();
    let optimistic = false;
    try {
      await this.prepare(capture, "message.submit");
      const before = composerReady(this.runtime, capture, false);
      if (workTicket) this.runtime.work.context.assert(workTicket.capture, true);
      if (attachmentIds.length) this.runtime.attachments.ready(capture, attachmentIds);
      const response = this.runtime.client.request({ op: "message.submit", sessionId, text, ...(mode ? { mode } : {}),
        ...(attachmentIds.length ? { attachmentIds } : {}) });
      if (!before.running) {
        this.runtime.store.update(sessionId, (state) => optimisticUser(state, optimisticId, text));
        optimistic = true;
      }
      const result = await response;
      if (workTicket) this.runtime.work.actions.confirm(workTicket, { kind: "queue", ...result.data });
      this.runtime.attachments.accepted(capture, attachments);
      const userRowId = result.data.userRowId;
      if (optimistic && result.data.status === "queued" && this.runtime.enabled()) {
        this.runtime.store.update(sessionId, (state) => removeOptimisticUser(state, optimisticId));
      } else if (userRowId !== null && this.runtime.enabled()) {
        this.runtime.store.update(sessionId, (state) => applySubmitReceipt(state, optimisticId, userRowId,
          state.epoch === before.epoch ? attachments.flatMap((entry) => entry.attachment ? [entry.attachment] : []) : []));
      }
      if (workTicket) this.runtime.work.reads.schedule(sessionId);
      if (result.data.status === "queued") this.runtime.work.reads.schedule(sessionId);
      else if (!workTicket && result.data.status !== "streaming") this.refreshAfterWrite(capture);
      if (this.runtime.owners.valid(capture) && capture.draft.version === capture.draftVersion && capture.draft.text === text) {
        capture.draft.text = "";
        capture.draft.version++;
      }
      if (capture.draft.unknown?.operation === "message.submit" && capture.draft.unknown.text === text) capture.draft.unknown = null;
    } catch (error) {
      if (workTicket) this.runtime.work.actions.fail(workTicket, error);
      const info = errorInfo(error);
      if (optimistic && info.outcome === "not_sent") this.runtime.store.update(sessionId, (state) => removeOptimisticUser(state, optimisticId));
      this.failure(capture, error, "message.submit", text, mode, attachmentIds);
      throw error;
    } finally {
      capture.draft.submitting = false;
      this.emit(capture);
    }
  }
  private async simple(id: string, op: "session.stop"): Promise<void> {
    const capture = this.runtime.owners.capture(id);
    const sessionId = this.sessionId(capture);
    this.stopReady(capture);
    const composer = capture.draft.composer, socket = this.runtime.client.generation;
    try {
      await this.prepare(capture, op);
      this.stopReady(capture);
      if (capture.draft.composer !== composer || this.runtime.client.generation !== socket) throw new ChatError("OWNER_CHANGED", "Der Stop-Kontext wurde inzwischen geändert.");
      await this.runtime.client.request({ op, sessionId });
      this.refreshAfterWrite(capture);
    } catch (error) { this.failure(capture, error, op); throw error; }
  }
  private stop(id: string): Promise<void> {
    const draft = this.runtime.owners.capture(id).draft;
    const running = this.stopPending.get(draft);
    if (running) return running;
    const request = this.simple(id, "session.stop").finally(() => { if (this.stopPending.get(draft) === request) this.stopPending.delete(draft); });
    this.stopPending.set(draft, request); return request;
  }
  private stopReady(capture: OwnerCapture): void {
    this.assert(capture);
    if (capture.owner.options.active === false || capture.owner.options.visible === false
      || (typeof document !== "undefined" && document.visibilityState === "hidden") || this.runtime.client.getSnapshot().state !== "online") {
      throw new ChatError("SESSION_UNAVAILABLE", "Stop ist in dieser Hermes-Fläche gerade nicht bereit.");
    }
  }
  private async catalog(id: string): Promise<void> {
    const capture = this.runtime.owners.capture(id);
    const sessionId = this.sessionId(capture);
    await this.runtime.ensureSubscribed(sessionId);
    const generation = this.runtime.store.get(sessionId).generation;
    const valid = () => this.runtime.sessionIsLeased(sessionId) && this.runtime.store.get(sessionId).generation === generation;
    this.runtime.store.update(sessionId, (state) => ({ ...state, catalog: { ...state.catalog, loading: true, error: null } }));
    try {
      const result = await this.runtime.read({ op: "catalog.read", sessionId }, valid);
      if (!valid()) throw new ChatError("STALE_READ", "Der Modellkatalog wurde durch einen neuen Abgleich ersetzt.");
      this.runtime.store.update(sessionId, (state) => ({ ...state, catalog: {
        commands: result.data.commands, models: result.data.models,
        ...(result.data.hermesEfforts ? { hermesEfforts: result.data.hermesEfforts } : {}), loading: false, error: null,
      } }));
    } catch (error) {
      if (valid()) this.runtime.store.update(sessionId, (state) => ({ ...state,
        catalog: { ...state.catalog, loading: false, error: errorInfo(error) } }));
      throw error;
    }
  }
  private model(id: string, selection: HermesV2Selection, confirmed?: boolean): Promise<void> {
    return this.runtime.composer.model(id, selection, confirmed);
  }
  private async approvals(id: string, mode: ChatApprovalMode): Promise<void> {
    const capture = this.runtime.owners.capture(id);
    const before = composerReady(this.runtime, capture);
    if (!before.composer?.approvals.editable || !before.composer.approvals.options?.some((option) => option.mode === mode && option.available)) {
      throw new ChatError("APPROVAL_UNAVAILABLE", "Dieser Freigabemodus ist nicht verfügbar.");
    }
    if (this.approvalPending.has(capture.draft)) return;
    const sessionId = this.sessionId(capture), composer = capture.draft.composer, socket = this.runtime.client.generation;
    const valid = () => this.runtime.enabled() && this.runtime.owners.valid(capture) && capture.draft.composer === composer
      && this.runtime.client.generation === socket && this.runtime.store.get(sessionId).epoch === before.epoch
      && this.runtime.store.get(sessionId).generation === before.generation;
    this.approvalPending.add(capture.draft);
    capture.draft.error = null; this.emit(capture);
    try {
      await this.runtime.client.ready(); composerReady(this.runtime, capture);
      if (!valid()) return;
      const result = await this.runtime.client.request({ op: "composer.approvals", sessionId, mode });
      if (!valid()) return;
      if (result.data.mode !== mode) throw new ChatError("PROTOCOL_MISMATCH", "Die Freigabeantwort gehört nicht zur angefragten Auswahl.", "unknown");
      this.runtime.store.update(sessionId, (state) => ({ ...state, composer: result.data.observed }));
      if (result.data.observed.approvals.mode !== mode) throw new ChatError("APPROVAL_UNCONFIRMED", "Hermes hat den Freigabemodus noch nicht bestätigt.", "unknown");
      this.emit(capture);
    } catch (error) { if (valid()) this.failure(capture, error, "composer.approvals"); }
    finally { this.approvalPending.delete(capture.draft); this.emit(capture); }
  }
  private async prepare(capture: OwnerCapture, op: GatewayOperation["op"]): Promise<void> {
    const id = this.sessionId(capture);
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!isPriority(op) || !this.runtime.sessionIsSynced(id)) {
        await this.runtime.ensureSubscribed(id);
        this.assert(capture);
      }
      const generation = this.runtime.client.generation;
      await this.runtime.client.ready(isPriority(op));
      this.assert(capture);
      if (generation === this.runtime.client.generation && this.runtime.sessionIsSynced(id)) break;
      if (attempt === 2) throw new ChatError("CLIENT_BUSY", "Hermes wird noch abgeglichen. Bitte erneut versuchen.");
    }
    const state = this.runtime.store.get(id);
    if (!state.writable && op !== "session.stop") throw new ChatError("SESSION_UNAVAILABLE", state.blockedReason ?? "Diese Sitzung ist schreibgeschützt.");
  }
  private assert(capture: OwnerCapture): void {
    this.runtime.owners.assert(capture);
    if (!this.runtime.enabled()) throw new ChatError("V2_DISABLED", "Hermes V2 wurde deaktiviert.");
  }
  private sessionId(capture: OwnerCapture): string {
    if (!capture.sessionId) throw new ChatError("SESSION_NOT_FOUND", "Bitte zuerst eine Sitzung auswählen.");
    return capture.sessionId;
  }
  private failure(capture: OwnerCapture, error: unknown, operation: string, text: string | null = null, mode?: "normal" | "queue", attachmentIds?: readonly string[]): void {
    const info = errorInfo(error);
    capture.draft.error = info;
    if (info.outcome === "unknown" && (operation === "message.submit" || capture.draft.unknown?.operation !== "message.submit")) capture.draft.unknown = { operation, warning: unknownWarning,
      resynced: false, canResend: operation === "message.submit", text, mode,
      ...(attachmentIds?.length ? { attachmentIds } : {}),
      ownerGeneration: capture.generation, draftVersion: capture.draftVersion };
    this.emit(capture);
  }
  private emit(capture: OwnerCapture): void {
    if (this.runtime.owners.records.get(capture.owner.id) === capture.owner) this.runtime.owners.emit(capture.owner);
  }
  private refreshAfterWrite(capture: OwnerCapture): void {
    if (this.runtime.owners.valid(capture) && this.runtime.enabled() && capture.sessionId) {
      void this.runtime.ensureSubscribed(capture.sessionId, true).catch(() => {
        // Read-Fehler bleibt im Session-Store sichtbar; die Mutation wird nicht wiederholt.
      });
    }
  }
}
