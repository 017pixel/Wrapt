import type { HermesV2Effort } from "@wrapt/contracts/hermes-v2";
import type { ChatRuntime } from "./chat-runtime";
import type { OwnerCapture, OwnerRecord } from "./chat-owners";
import type { HermesV2Selection } from "./chat-types";
import { emptyChatComposer, type ChatComposerView } from "./chat-composer-types";
import { newComposerDraft, sameSelection, type ComposerDraft } from "./chat-composer-state";
import { composerReady } from "./chat-composer-guards";
import { ChatError, errorInfo } from "./gateway-protocol";

export class ChatComposer {
  private contexts = new WeakMap<object, { epoch: string | null; revision: number; socket: number; generation: number }>();
  private pending = new WeakMap<ComposerDraft, Set<string>>();
  constructor(private readonly runtime: ChatRuntime) {}
  view(owner: OwnerRecord): ChatComposerView {
    const draft = owner.drafts.get(owner.sessionId)?.composer;
    const state = owner.sessionId ? this.runtime.store.peek(owner.sessionId) : null;
    if (!draft) return emptyChatComposer;
    return { available: !!this.runtime.client.getComposerBinding(), settings: state?.composer ?? null,
      model: draft.model, title: draft.title,
      reasoning: { ...draft.reasoning, observed: state?.composer?.reasoning ?? null },
      attachments: draft.attachments.map(({ uploadId, name, bytes, mime, status, attachment, error }) => ({ uploadId, name, bytes, mime, status, attachment, error })) };
  }
  invalidate(owner: OwnerRecord): void {
    for (const draft of owner.drafts.values()) {
      this.runtime.attachments.cancel(draft);
      draft.composer = newComposerDraft();
    }
  }
  sync(id?: string): void {
    for (const owner of this.runtime.owners.records.values()) {
      if (!owner.mounted || (id && owner.sessionId !== id)) continue;
      const draft = owner.drafts.get(owner.sessionId)?.composer;
      const state = owner.sessionId ? this.runtime.store.peek(owner.sessionId) : null;
      if (draft && state) {
        for (const kind of ["model", "reasoning", "title"] as const) {
          const entry = draft[kind], context = this.contexts.get(entry);
          if (entry.status !== "pending" || !context) continue;
          if (context.epoch !== state.epoch || context.socket !== this.runtime.client.generation || context.generation !== state.generation
            || (kind === "model" && context.revision !== state.selectionRevision)
            || (kind === "reasoning" && context.revision !== state.modelRevision)) {
            if (kind === "model") draft.model = { requested: null, status: "idle", confirmation: null };
            else if (kind === "reasoning") draft.reasoning = { requested: null, status: "idle", observed: null };
            else draft.title = { requested: null, status: "idle", title: null };
          }
        }
      }
      if (draft?.confirmation && (!state || draft.confirmation.revision !== state.selectionRevision
        || draft.confirmation.epoch !== state.epoch || draft.confirmation.socket !== this.runtime.client.generation)) {
        draft.confirmation = null; draft.model = { requested: null, status: "idle", confirmation: null };
      }
      this.runtime.attachments.sync(owner);
      this.runtime.owners.emit(owner);
    }
  }
  cancelModel(id: string): void {
    const capture = this.runtime.owners.capture(id);
    capture.draft.composer.model = { requested: null, status: "idle", confirmation: null };
    capture.draft.composer.confirmation = null; this.runtime.owners.emit(capture.owner);
  }
  async model(id: string, selection: HermesV2Selection, confirmed = false): Promise<void> {
    let capture: OwnerCapture | undefined;
    let entry: ChatComposerView["model"] | undefined;
    let release: (() => void) | null = null;
    try {
      capture = this.runtime.owners.capture(id);
      const before = composerReady(this.runtime, capture, false);
      const local = capture.draft.composer, confirmation = local.confirmation;
      const socket = this.runtime.client.generation;
      const valid = () => this.runtime.enabled() && this.runtime.owners.valid(capture!) && capture!.draft.composer === local;
      const context = () => valid() && this.runtime.store.get(capture!.sessionId!).generation === before.generation
        && this.runtime.store.get(capture!.sessionId!).selectionRevision === before.selectionRevision && this.runtime.client.generation === socket;
      if (confirmed && (!confirmation || confirmation.ownerGeneration !== capture.generation || confirmation.sessionId !== capture.sessionId
        || confirmation.epoch !== before.epoch || confirmation.revision !== before.selectionRevision || confirmation.socket !== socket
        || !sameSelection(local.model.confirmation?.selection ?? null, selection) || !sameSelection(confirmation.selection, before.selection))) throw new ChatError("MODEL_CONFIRM_REQUIRED", "Bitte diese aktuelle Modellwahl erneut bestätigen.");
      release = this.hold(local, ["model", before.epoch, socket, selection.provider, selection.model, confirmed]);
      if (!release) return;
      entry = { requested: { ...selection }, status: "pending", confirmation: null };
      this.contexts.set(entry, { epoch: before.epoch, revision: before.selectionRevision, socket, generation: before.generation });
      local.model = entry; capture.draft.error = null; this.runtime.owners.emit(capture.owner);
      await this.runtime.client.ready();
      composerReady(this.runtime, capture, false);
      if (!context() || local.model !== entry) return;
      const result = await this.runtime.client.request({ op: "model.select", sessionId: capture.sessionId!, selection, ...(confirmed ? { confirmed: true } : {}) });
      if (!context() || local.model !== entry) return;
      if (!sameSelection(result.data.selection, selection)) throw new ChatError("PROTOCOL_MISMATCH", "Die Modellantwort gehört nicht zur angefragten Auswahl.", "unknown");
      if (result.data.confirmation && !confirmed) {
        local.model = { requested: selection, status: "confirmation", confirmation: { selection, message: result.data.confirmation } };
        local.confirmation = { ownerGeneration: capture.generation, sessionId: capture.sessionId!, epoch: before.epoch,
          revision: before.selectionRevision, socket, selection: before.selection };
      } else {
        local.confirmation = null;
        local.model = { requested: selection, status: result.data.deferred ? "deferred" : "idle", confirmation: null };
        if (!result.data.deferred) this.runtime.store.update(capture.sessionId!, (state) => ({ ...state, selection: result.data.selection,
          modelRevision: state.modelRevision + (sameSelection(state.selection, result.data.selection) ? 0 : 1) }));
        void this.runtime.ensureSubscribed(capture.sessionId!, true).catch(() => {
          // Der Sessionstore zeigt den Lesefehler; die Modellmutation wird nicht wiederholt.
        });
      }
      this.runtime.owners.emit(capture.owner);
    } catch (error) { this.fail(capture, error, "model", entry); }
    finally { release?.(); }
  }
  async title(id: string, title: string): Promise<void> {
    let capture: OwnerCapture | undefined;
    let entry: ChatComposerView["title"] | undefined;
    let release: (() => void) | null = null;
    try {
      capture = this.runtime.owners.capture(id);
      const before = composerReady(this.runtime, capture);
      title = title.trim();
      if (!title || title.length > 200) throw new ChatError("INVALID_TITLE", "Der Titel muss 1 bis 200 Zeichen enthalten.");
      const local = capture.draft.composer;
      const socket = this.runtime.client.generation;
      release = this.hold(local, ["title", before.epoch, socket, title]);
      if (!release) return;
      entry = { requested: title, title: null, status: "pending" };
      local.title = entry; capture.draft.error = null; this.runtime.owners.emit(capture.owner);
      this.contexts.set(entry, { epoch: before.epoch, revision: before.selectionRevision, socket, generation: before.generation });
      await this.runtime.client.ready(); composerReady(this.runtime, capture);
      if (local.title !== entry || this.runtime.client.generation !== socket || this.runtime.store.get(capture.sessionId!).epoch !== before.epoch
        || this.runtime.store.get(capture.sessionId!).generation !== before.generation) return;
      const result = await this.runtime.client.request({ op: "session.title", sessionId: capture.sessionId!, title });
      if (!this.runtime.enabled() || !this.runtime.owners.valid(capture) || capture.draft.composer !== local || local.title !== entry
        || this.runtime.client.generation !== socket || this.runtime.store.get(capture.sessionId!).epoch !== before.epoch) return;
      const current = this.runtime.store.get(capture.sessionId!);
      const superseded = current.generation !== before.generation || (current.session?.title !== before.session?.title && current.session?.title !== result.data.title);
      local.title = { requested: title, title: result.data.title, status: result.data.pending || superseded ? "unconfirmed" : "applied" };
      if (!result.data.pending && current.session && current.generation === before.generation && current.session.title === before.session?.title) {
        const session = { ...current.session, title: result.data.title };
        this.runtime.store.update(capture.sessionId!, (value) => ({ ...value, session })); this.runtime.upsertSummary(session);
      }
      this.runtime.owners.emit(capture.owner);
    } catch (error) { this.fail(capture, error, "title", entry); }
    finally { release?.(); }
  }
  async reasoning(id: string, effort: HermesV2Effort): Promise<void> {
    let capture: OwnerCapture | undefined;
    let entry: ChatComposerView["reasoning"] | undefined;
    let release: (() => void) | null = null;
    try {
      capture = this.runtime.owners.capture(id);
      const before = composerReady(this.runtime, capture, true, true), selection = before.selection;
      if (!selection || !before.catalog.hermesEfforts?.includes(effort)) throw new ChatError("EFFORT_UNAVAILABLE", "Diese Hermes-Stufe ist nicht im aktuellen Katalog bestätigt.");
      const model = before.catalog.models?.providers.find((provider) => provider.id === selection.provider)?.models.find((item) => item.id === selection.model);
      if (effort === "none" && model?.canDisableReasoning !== true) throw new ChatError("EFFORT_UNAVAILABLE", "Dieses Modell bestätigt kein Abschalten des Reasonings.");
      const local = capture.draft.composer;
      const socket = this.runtime.client.generation;
      release = this.hold(local, ["reasoning", before.epoch, socket, before.modelRevision, effort]);
      if (!release) return;
      entry = { requested: effort, observed: null, status: "pending" };
      local.reasoning = entry; capture.draft.error = null; this.runtime.owners.emit(capture.owner);
      this.contexts.set(entry, { epoch: before.epoch, revision: before.modelRevision, socket, generation: before.generation });
      await this.runtime.client.ready(); const current = composerReady(this.runtime, capture, true, true);
      if (local.reasoning !== entry || this.runtime.client.generation !== socket || current.epoch !== before.epoch
        || current.modelRevision !== before.modelRevision || !sameSelection(current.selection, selection)) return;
      const result = await this.runtime.client.request({ op: "reasoning.select", sessionId: capture.sessionId!, effort, selection });
      const latest = this.runtime.store.get(capture.sessionId!);
      if (!this.runtime.enabled() || !this.runtime.owners.valid(capture) || capture.draft.composer !== local || local.reasoning !== entry
        || latest.epoch !== before.epoch || latest.modelRevision !== before.modelRevision || this.runtime.client.generation !== socket) return;
      if (result.data.requested !== effort) throw new ChatError("PROTOCOL_MISMATCH", "Die Reasoningantwort gehört nicht zur angefragten Stufe.", "unknown");
      local.reasoning = { requested: effort, observed: result.data.observed.reasoning, status: result.data.observation };
      this.runtime.store.update(capture.sessionId!, (state) => ({ ...state, composer: result.data.observed })); this.runtime.owners.emit(capture.owner);
    } catch (error) { this.fail(capture, error, "reasoning", entry); }
    finally { release?.(); }
  }
  /** Nur gleiche offene Wünsche desselben tatsächlichen Owner-/Sitzungskontexts sperren. */
  private hold(draft: ComposerDraft, identity: readonly unknown[]): (() => void) | null {
    const key = JSON.stringify(identity), pending = this.pending.get(draft) ?? new Set<string>();
    if (pending.has(key)) return null;
    pending.add(key); this.pending.set(draft, pending);
    return () => { pending.delete(key); if (!pending.size) this.pending.delete(draft); };
  }
  private fail(capture: OwnerCapture | undefined, error: unknown, kind: "model" | "title" | "reasoning",
    entry: ChatComposerView["model"] | ChatComposerView["title"] | ChatComposerView["reasoning"] | undefined): void {
    if (!capture || !this.runtime.enabled() || !this.runtime.owners.valid(capture)) return;
    if (entry && capture.draft.composer[kind] !== entry) return;
    const context = entry ? this.contexts.get(entry) : null;
    if (context && (this.runtime.store.peek(capture.sessionId!)?.epoch !== context.epoch || this.runtime.client.generation !== context.socket)) return;
    const state = this.runtime.store.peek(capture.sessionId!);
    if (context && (kind === "model" ? state?.selectionRevision !== context.revision : kind === "reasoning" && state?.modelRevision !== context.revision)) return;
    const info = errorInfo(error); capture.draft.error = info;
    if (entry?.status === "pending") entry.status = info.outcome === "unknown" ? "unknown" : "idle";
    this.runtime.owners.emit(capture.owner);
  }
}
