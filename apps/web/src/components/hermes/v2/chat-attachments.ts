import type { HermesV2UploadStatus } from "@wrapt/contracts/hermes-v2";
import type { ChatRuntime } from "./chat-runtime";
import type { DraftState, OwnerCapture, OwnerRecord } from "./chat-owners";
import type { AttachmentBinding, AttachmentEntry } from "./chat-composer-state";
import { composerReady } from "./chat-composer-guards";
import { ChatAttachmentClient } from "./chat-attachment-client";
import { ChatError, errorInfo } from "./gateway-protocol";
import { chatPolicy } from "./chat-policy";

export class ChatAttachments {
  private controllers = new Map<AttachmentEntry, AbortController>();
  private operations = new Map<AttachmentEntry, object>();
  private timers = new Map<AttachmentEntry, ReturnType<typeof setTimeout>>();
  constructor(private readonly runtime: ChatRuntime, private readonly client = new ChatAttachmentClient()) {}
  binding(capture: OwnerCapture): AttachmentBinding {
    const state = composerReady(this.runtime, capture), connection = this.runtime.client.getComposerBinding()!;
    if (!state.epoch) throw new ChatError("ATTACHMENT_BINDING", "Die Dateisitzung ist nicht bestätigt.");
    return { ownerGeneration: capture.generation, sessionId: capture.sessionId!, epoch: state.epoch, cwd: state.session?.cwd ?? null,
      connectionId: connection.id, connectionEpoch: connection.epoch, socket: connection.generation, subscription: this.runtime.sessionSubscription(capture.sessionId!) };
  }
  private same(left: AttachmentBinding, right: AttachmentBinding): boolean { return JSON.stringify(left) === JSON.stringify(right); }
  async upload(id: string, file: File): Promise<void> {
    let capture: OwnerCapture | undefined, entry: AttachmentEntry | undefined;
    let operation: object | undefined;
    try {
      capture = this.runtime.owners.capture(id);
      const binding = this.binding(capture);
      if (file.size < 1 || file.size > chatPolicy.attachmentBytes) throw new ChatError("ATTACHMENT_SIZE", "Dateien dürfen höchstens 4 MiB groß und nicht leer sein.");
      if (capture.draft.composer.attachments.length >= chatPolicy.maxAttachments) throw new ChatError("ATTACHMENT_LIMIT", "Pro Nachricht sind höchstens zehn Dateianhänge möglich.");
      if (this.controllers.size) throw new ChatError("UPLOAD_BUSY", "Bitte den laufenden Dateivorgang zuerst abschließen.");
      entry = { uploadId: crypto.randomUUID(), name: file.name.slice(0, 200), bytes: file.size, mime: file.type.slice(0, 100) || "application/octet-stream",
        status: "uploading", attachment: null, error: null, binding };
      capture.draft.composer.attachments.push(entry); capture.draft.version++; capture.draft.error = null;
      this.runtime.owners.emit(capture.owner);
      const controller = new AbortController(); this.controllers.set(entry, controller);
      operation = {}; this.operations.set(entry, operation);
      const timer = this.deadline(capture, entry, controller, operation);
      try {
        if (!this.present(capture, entry)) return;
        if (!this.same(binding, this.binding(capture))) throw new ChatError("ATTACHMENT_BINDING", "Der Dateikontext wurde inzwischen geändert.");
        const result = await this.client.upload(file, binding.sessionId, binding.connectionId, entry.uploadId, controller.signal);
        if (!this.present(capture, entry) || this.operations.get(entry) !== operation) return;
        this.checkBinding(capture, binding);
        this.apply(entry, result);
        this.runtime.owners.emit(capture.owner);
      } finally { this.clearTimer(entry, timer); if (this.controllers.get(entry) === controller) this.controllers.delete(entry); }
    } catch (error) { if (!entry || !operation || this.operations.get(entry) === operation) this.fail(capture, entry, error); }
    finally { if (entry && this.operations.get(entry) === operation) this.operations.delete(entry); }
  }
  async check(id: string, uploadId: string): Promise<void> {
    let capture: OwnerCapture | undefined, entry: AttachmentEntry | undefined;
    let operation: object | undefined;
    try {
      capture = this.runtime.owners.capture(id);
      const binding = this.binding(capture);
      entry = capture.draft.composer.attachments.find((value) => value.uploadId === uploadId);
      if (!entry) throw new ChatError("ATTACHMENT_MISSING", "Dieser Dateivorgang ist nicht mehr im eigenen Entwurf.");
      if (entry.binding.epoch !== binding.epoch || entry.binding.connectionEpoch !== binding.connectionEpoch || entry.binding.cwd !== binding.cwd || entry.binding.sessionId !== binding.sessionId
        || entry.binding.ownerGeneration !== binding.ownerGeneration) throw new ChatError("ATTACHMENT_BINDING", "Die Datei muss für diesen neuen Sitzungskontext erneut angehängt werden.");
      if (this.controllers.has(entry)) throw new ChatError("UPLOAD_BUSY", "Dieser Dateivorgang läuft noch.");
      const controller = new AbortController(); this.controllers.set(entry, controller);
      operation = {}; this.operations.set(entry, operation);
      const timer = this.deadline(capture, entry, controller, operation);
      try {
        if (!this.present(capture, entry)) return;
        if (!this.same(binding, this.binding(capture))) throw new ChatError("ATTACHMENT_BINDING", "Der Dateikontext wurde inzwischen geändert.");
        const result = await this.client.status(binding.connectionId, uploadId, controller.signal);
        if (!this.present(capture, entry) || this.operations.get(entry) !== operation) return;
        this.checkBinding(capture, binding);
        entry.binding = binding; this.apply(entry, result);
        this.runtime.owners.emit(capture.owner);
      } finally { this.clearTimer(entry, timer); if (this.controllers.get(entry) === controller) this.controllers.delete(entry); }
    } catch (error) {
      if (!entry || !operation || this.operations.get(entry) === operation) {
        const info = errorInfo(error);
        this.fail(capture, entry, entry ? new ChatError(info.code, info.message, "unknown") : error);
      }
    } finally { if (entry && this.operations.get(entry) === operation) this.operations.delete(entry); }
  }
  remove(id: string, uploadId: string): void {
    const capture = this.runtime.owners.capture(id);
    const entry = capture.draft.composer.attachments.find((value) => value.uploadId === uploadId);
    if (!entry) return;
    this.controllers.get(entry)?.abort();
    this.controllers.delete(entry); this.operations.delete(entry);
    this.clearTimer(entry);
    capture.draft.composer.attachments = capture.draft.composer.attachments.filter((value) => value !== entry);
    capture.draft.version++; this.runtime.owners.emit(capture.owner);
  }
  ready(capture: OwnerCapture, ids?: readonly string[]): AttachmentEntry[] {
    const all = capture.draft.composer.attachments;
    if (!all.length && !ids?.length) return [];
    const binding = this.binding(capture);
    const entries = ids ? ids.map((id) => all.find((entry) => entry.attachment?.id === id)) : [...all];
    if (entries.some((entry) => !entry || entry.status !== "ready" || !entry.attachment || entry.attachment.expiresAt <= Date.now()
      || !this.same(binding, entry.binding))) throw new ChatError("ATTACHMENT_UNCONFIRMED", "Bitte die eigenen Dateianhänge vor dem Senden prüfen oder entfernen.");
    return entries as AttachmentEntry[];
  }
  accepted(capture: OwnerCapture, entries: readonly AttachmentEntry[]): void {
    if (!this.runtime.enabled() || !this.runtime.owners.valid(capture)) return;
    capture.draft.composer.attachments = capture.draft.composer.attachments.filter((entry) => !entries.includes(entry));
  }
  sync(owner: OwnerRecord): void {
    const draft = owner.drafts.get(owner.sessionId);
    if (!draft || !owner.mounted) return;
    for (const entry of draft.composer.attachments) {
      let valid = false;
      try { valid = this.same(entry.binding, this.binding(this.runtime.owners.capture(owner.id))); } catch { /* Nicht bereit ist kein Dateibeleg. */ }
      if (!valid) { this.controllers.get(entry)?.abort(); this.controllers.delete(entry); this.operations.delete(entry); this.clearTimer(entry); entry.status = "unknown"; }
      else if (entry.attachment && entry.attachment.expiresAt <= Date.now()) entry.status = "expired";
    }
  }
  cancel(draft: DraftState): void {
    for (const entry of draft.composer.attachments) { this.controllers.get(entry)?.abort(); this.controllers.delete(entry); this.operations.delete(entry); this.clearTimer(entry); }
  }
  dispose(): void {
    for (const controller of this.controllers.values()) controller.abort();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.controllers.clear(); this.operations.clear(); this.timers.clear();
  }
  private clearTimer(entry: AttachmentEntry, expected = this.timers.get(entry)): void {
    if (expected) clearTimeout(expected);
    if (this.timers.get(entry) === expected) this.timers.delete(entry);
  }
  private deadline(capture: OwnerCapture, entry: AttachmentEntry, controller: AbortController, operation: object): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      controller.abort();
      if (this.operations.get(entry) !== operation) return;
      this.operations.delete(entry); this.controllers.delete(entry);
      this.clearTimer(entry, timer);
      this.fail(capture, entry, new ChatError("UPLOAD_UNKNOWN", "Der Dateiausgang ist unklar. Bitte denselben Uploadstatus prüfen.", "unknown"));
    }, chatPolicy.uploadTimeoutMs);
    this.timers.set(entry, timer); return timer;
  }
  private checkBinding(capture: OwnerCapture, binding: AttachmentBinding): void {
    let current: AttachmentBinding | null = null;
    try { current = this.binding(capture); } catch { /* Fehlende Bereitschaft bestätigt keinen bereits gesendeten Upload. */ }
    if (!current || !this.same(binding, current)) throw new ChatError("ATTACHMENT_BINDING", "Der Dateikontext wurde inzwischen geändert.", "unknown");
  }
  private present(capture: OwnerCapture, entry: AttachmentEntry): boolean {
    return this.runtime.enabled() && this.runtime.owners.valid(capture) && capture.draft.composer.attachments.includes(entry);
  }
  private apply(entry: AttachmentEntry, result: HermesV2UploadStatus): void {
    entry.status = result.state; entry.attachment = result.attachment; entry.error = null;
    if (entry.attachment && entry.attachment.expiresAt <= Date.now()) entry.status = "expired";
    if (entry.attachment) { entry.name = entry.attachment.name; entry.bytes = entry.attachment.bytes; entry.mime = entry.attachment.mime; }
  }
  private fail(capture: OwnerCapture | undefined, entry: AttachmentEntry | undefined, error: unknown): void {
    if (!capture || !this.runtime.enabled() || !this.runtime.owners.valid(capture) || (entry && !this.present(capture, entry))) return;
    const info = errorInfo(error); capture.draft.error = info;
    if (entry) { entry.status = info.outcome === "unknown" || entry.attachment ? "unknown" : "not_sent"; entry.error = info; }
    this.runtime.owners.emit(capture.owner);
  }
}
