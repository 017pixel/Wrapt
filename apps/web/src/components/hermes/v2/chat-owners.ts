import { ChatError, errorInfo } from "./gateway-protocol";
import type { ChatErrorInfo, ChatRequestState, HermesV2ChatOptions, UnknownSendView } from "./chat-types";
import { chatPolicy } from "./chat-policy";
import { newComposerDraft, type ComposerDraft } from "./chat-composer-state";
import { emptyChatComposer, type ChatComposerView } from "./chat-composer-types";
import { emptyChatWork, type ChatWorkView } from "./chat-work-types";

export interface DraftState {
  text: string;
  version: number;
  submitting: boolean;
  error: ChatErrorInfo | null;
  unknown: (UnknownSendView & { text: string | null; mode: "normal" | "queue" | undefined;
    ownerGeneration: number; draftVersion: number; attachmentIds?: readonly string[] }) | null;
  composer: ComposerDraft;
}
export interface OwnerView {
  sessionId: string | null;
  draft: string;
  submitting: boolean;
  actionError: ChatErrorInfo | null;
  unknownSend: UnknownSendView | null;
  requestStates: readonly ChatRequestState[];
  composer: ChatComposerView;
  work: ChatWorkView;
}
export interface OwnerRecord {
  id: string;
  mounted: boolean;
  generation: number;
  sessionId: string | null;
  inputSessionId: string | null;
  options: HermesV2ChatOptions;
  drafts: Map<string | null, DraftState>;
  view: OwnerView;
}
export interface OwnerCapture {
  owner: OwnerRecord;
  generation: number;
  sessionId: string | null;
  draft: DraftState;
  draftVersion: number;
}
export const emptyOwner: OwnerView = { sessionId: null, draft: "", submitting: false, actionError: null, unknownSend: null, requestStates: [], composer: emptyChatComposer, work: emptyChatWork };
export class ChatOwners {
  readonly records = new Map<string, OwnerRecord>();
  private listeners = new Map<string, Set<() => void>>();
  constructor(private readonly selectionChanged: (before: string | null, after: string | null) => void,
    private readonly requestStates: (sessionId: string | null) => readonly ChatRequestState[] = () => [],
    private readonly composerView: (owner: OwnerRecord) => ChatComposerView = () => emptyChatComposer,
    private readonly invalidateComposer: (owner: OwnerRecord) => void = () => {},
    private readonly workView: (owner: OwnerRecord) => ChatWorkView = () => emptyChatWork) {}
  subscribe(id: string, listener: () => void): () => void {
    const listeners = this.listeners.get(id) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(id, listeners);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(id); };
  }
  getView(id: string): OwnerView { return this.records.get(id)?.view ?? emptyOwner; }
  acquire(options: HermesV2ChatOptions): OwnerRecord {
    let owner = this.records.get(options.ownerId);
    if (!owner) {
      owner = { id: options.ownerId, mounted: false, generation: 0, sessionId: options.sessionId,
        inputSessionId: options.sessionId, options, drafts: new Map(), view: emptyOwner };
      this.records.set(owner.id, owner);
      this.selectionChanged(null, owner.sessionId);
    }
    owner.mounted = true;
    this.update(options);
    this.emit(owner);
    return owner;
  }
  update(options: HermesV2ChatOptions): void {
    const owner = this.records.get(options.ownerId);
    if (!owner) return;
    const visibilityChanged = owner.options.active !== options.active || owner.options.visible !== options.visible;
    owner.options = options;
    if (visibilityChanged && (options.active === false || options.visible === false)) this.invalidateComposer(owner);
    if (options.active !== false && options.sessionId !== owner.inputSessionId) {
      owner.inputSessionId = options.sessionId;
      this.select(owner, options.sessionId, false);
    } else if (visibilityChanged) this.emit(owner);
  }
  release(owner: OwnerRecord): void {
    owner.mounted = false;
    owner.generation++;
    this.invalidateComposer(owner);
    const generation = owner.generation;
    queueMicrotask(() => {
      if (owner.mounted || owner.generation !== generation || this.records.get(owner.id) !== owner) return;
      this.records.delete(owner.id);
      this.selectionChanged(owner.sessionId, null);
      owner.drafts.clear();
      this.notify(owner.id);
    });
  }
  select(owner: OwnerRecord, sessionId: string | null, notifySelection = true): void {
    if (!owner.mounted) throw new ChatError("OWNER_CLOSED", "Diese Hermes-Fläche ist geschlossen.");
    if (owner.sessionId !== sessionId) {
      try { this.draft(owner, sessionId); }
      catch (error) {
        this.draft(owner).error = errorInfo(error);
        this.emit(owner);
        return;
      }
      const previous = owner.sessionId;
      owner.sessionId = sessionId;
      owner.generation++;
      this.invalidateComposer(owner);
      this.selectionChanged(previous, sessionId);
    }
    this.emit(owner);
    if (notifySelection) owner.options.onSelectSession(sessionId);
  }
  capture(id: string): OwnerCapture {
    const owner = this.records.get(id);
    if (!owner?.mounted) throw new ChatError("OWNER_CLOSED", "Diese Hermes-Fläche ist geschlossen.");
    const draft = this.draft(owner);
    return { owner, generation: owner.generation, sessionId: owner.sessionId, draft, draftVersion: draft.version };
  }
  valid(capture: OwnerCapture): boolean {
    return capture.owner.mounted && this.records.get(capture.owner.id) === capture.owner
      && capture.owner.generation === capture.generation && capture.owner.sessionId === capture.sessionId;
  }
  assert(capture: OwnerCapture): void {
    if (!this.valid(capture)) throw new ChatError("OWNER_CHANGED", "Die Hermes-Auswahl wurde inzwischen geändert.");
  }
  setDraft(id: string, text: string): void {
    const capture = this.capture(id);
    capture.draft.text = text.slice(0, chatPolicy.textLimit);
    capture.draft.version++;
    this.emit(capture.owner);
  }
  emit(owner: OwnerRecord): void {
    const draft = this.draft(owner);
    const composer = this.composerView(owner);
    owner.view = { sessionId: owner.sessionId, draft: draft.text, submitting: draft.submitting,
      actionError: draft.error, requestStates: this.requestStates(owner.sessionId), composer, work: this.workView(owner), unknownSend: draft.unknown ? { operation: draft.unknown.operation,
        warning: draft.unknown.warning, resynced: draft.unknown.resynced, canResend: draft.unknown.canResend
          && (!draft.unknown.attachmentIds?.length || draft.unknown.attachmentIds.every((id) => composer.attachments.some((entry) => entry.status === "ready" && entry.attachment?.id === id && entry.attachment.expiresAt > Date.now()))) } : null };
    this.notify(owner.id);
  }
  invalidateResync(): void {
    for (const owner of this.records.values()) {
      for (const draft of owner.drafts.values()) if (draft.unknown) draft.unknown.resynced = false;
      this.emit(owner);
    }
  }
  clear(): void {
    for (const owner of this.records.values()) { owner.mounted = false; owner.generation++; owner.drafts.clear(); }
    const ids = [...this.records.keys()];
    this.records.clear();
    for (const id of ids) this.notify(id);
  }
  private draft(owner: OwnerRecord, sessionId = owner.sessionId): DraftState {
    let draft = owner.drafts.get(sessionId);
    if (!draft) {
      if (owner.drafts.size >= chatPolicy.maxOwnerDrafts) {
        const disposable = [...owner.drafts].find(([id, entry]) => id !== owner.sessionId
          && !entry.text && !entry.unknown && !entry.submitting);
        if (disposable) owner.drafts.delete(disposable[0]);
      }
      if (owner.drafts.size >= chatPolicy.maxOwnerDrafts) {
        throw new ChatError("DRAFT_LIMIT", "Zu viele ungespeicherte Hermes-Entwürfe in dieser Fläche.");
      }
      draft = { text: "", version: 0, submitting: false, error: null, unknown: null, composer: newComposerDraft() };
      owner.drafts.set(sessionId, draft);
    }
    return draft;
  }
  private notify(id: string): void { for (const listener of this.listeners.get(id) ?? []) listener(); }
}
