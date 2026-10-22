import type { ChatRuntime } from "./chat-runtime";
import type { OwnerRecord } from "./chat-owners";
import type { ChatWorkContext, WorkCapture } from "./chat-work-context";
import type { ChatWorkAction, ChatWorkActionView, ChatWorkResult } from "./chat-work-types";
import { acceptedWorkTask } from "./chat-work-state";
import { ChatError, errorInfo, type GatewayOperation } from "./gateway-protocol";
import { chatPolicy } from "./chat-policy";
import type { HermesV2WorkPatch } from "@wrapt/contracts/hermes-v2";
import { ChatWorkReceipts, type WorkStartReceipt } from "./chat-work-receipts";

interface WorkLocal { entries: ChatWorkActionView[]; pending: Map<string, Promise<void>> }
export interface WorkTicket { capture: WorkCapture; local: WorkLocal; entry: ChatWorkActionView }
type NativeOperation = Extract<GatewayOperation, { op: `work.${string}` | "session.steer" }>;
export class ChatWorkActions {
  private locals = new WeakMap<OwnerRecord, WorkLocal>();
  private readonly receipts: ChatWorkReceipts;
  constructor(private readonly runtime: ChatRuntime, private readonly context: ChatWorkContext,
    private readonly refresh: (id: string) => void) { this.receipts = new ChatWorkReceipts(context); }
  entries(owner: OwnerRecord): readonly ChatWorkActionView[] { return this.locals.get(owner)?.entries ?? []; }
  invalidate(owner: OwnerRecord): void { this.locals.delete(owner); this.receipts.invalidate(owner); }
  observe(sessionId: string, changes: readonly HermesV2WorkPatch[]): void { this.receipts.observe(sessionId, changes); }
  prune(): void { this.receipts.prune(); }
  dispose(): void { this.receipts.dispose(); }
  queuePending(owner: OwnerRecord, text: string): boolean {
    return this.entries(owner).some((entry) => entry.action === "queue" && entry.text === text && entry.status === "pending");
  }
  beginQueue(ownerId: string, text: string): WorkTicket { return this.begin(ownerId, "queue", null, text); }
  confirm(ticket: WorkTicket, result: ChatWorkResult): void {
    if (!this.context.valid(ticket.capture)) {
      this.fail(ticket, new ChatError("CONTEXT_CHANGED", "Der Ausgang der Aufgabenaktion ist unklar.", ticket.entry.action === "subagent.tail" ? "not_sent" : "unknown"));
      return;
    }
    if (this.locals.get(ticket.capture.owner.owner) !== ticket.local) return;
    ticket.local.entries = ticket.local.entries.map((entry) => entry === ticket.entry ? { ...entry, status: "confirmed", result } : entry);
    this.emit(ticket);
  }
  fail(ticket: WorkTicket, error: unknown): void {
    if (!this.runtime.enabled() || !this.runtime.owners.valid(ticket.capture.owner) || this.locals.get(ticket.capture.owner.owner) !== ticket.local) return;
    const info = errorInfo(error);
    ticket.local.entries = ticket.local.entries.map((entry) => entry === ticket.entry ? { ...entry,
      status: info.outcome === "unknown" ? "unknown" : "not_sent", error: info } : entry);
    ticket.capture.owner.draft.error = info; this.emit(ticket);
  }
  run(ownerId: string, action: Exclude<ChatWorkAction, "queue">, targetId: string | null, text: string | null): Promise<void> {
    let ticket: WorkTicket;
    try {
      const capture = this.context.capture(ownerId, action !== "subagent.tail");
      if (text !== null && (!text.trim() || text.length > chatPolicy.textLimit)) throw new ChatError("INVALID_MESSAGE", "Bitte eine gültige Nachricht eingeben.");
      const local = this.local(capture.owner.owner), identity = JSON.stringify([action, targetId, text]);
      const running = local.pending.get(identity);
      if (running) return running;
      let release!: () => void;
      const request = new Promise<void>((resolve) => { release = resolve; });
      local.pending.set(identity, request);
      try { ticket = this.begin(ownerId, action, targetId, text); }
      catch (error) { local.pending.delete(identity); release(); throw error; }
      void this.perform(ticket).finally(() => { if (local.pending.get(identity) === request) local.pending.delete(identity); release(); });
      return request;
    } catch (error) {
      const owner = this.runtime.owners.records.get(ownerId);
      if (owner?.mounted) { this.runtime.owners.capture(ownerId).draft.error = errorInfo(error); this.runtime.owners.emit(owner); }
      return Promise.resolve();
    }
  }
  private begin(ownerId: string, action: ChatWorkAction, targetId: string | null, text: string | null): WorkTicket {
    const capture = this.context.capture(ownerId, action !== "subagent.tail"), local = this.local(capture.owner.owner);
    const work = this.runtime.store.get(capture.sessionId).work;
    if (targetId !== null && (action === "process.kill" ? !work.processes.some((row) => row.id === targetId)
      : !work.subagents.some((row) => row.id === targetId))) throw new ChatError("TARGET_UNAVAILABLE", "Dieses eigene Ziel ist nicht in der aktuellen Aufgabenansicht belegt.");
    if (local.entries.filter((entry) => entry.status === "pending").length >= chatPolicy.workActions) throw new ChatError("CLIENT_BUSY", "Zu viele offene Aufgabenaktionen.");
    const entry: ChatWorkActionView = { key: crypto.randomUUID(), action, targetId, text, status: "pending", result: null, error: null };
    const pending = local.entries.filter((row) => row.status === "pending");
    const room = chatPolicy.workActions - pending.length - 1;
    const settled = room > 0 ? local.entries.filter((row) => row.status !== "pending").slice(-room) : [];
    local.entries = [...settled, ...pending, entry];
    capture.owner.draft.error = null;
    const ticket = { capture, local, entry };
    this.emit(ticket); return ticket;
  }
  private async perform(ticket: WorkTicket): Promise<void> {
    const { capture, entry } = ticket;
    let sent = false;
    let start: WorkStartReceipt | null = null;
    try {
      await this.runtime.client.ready();
      this.context.assert(capture, entry.action !== "subagent.tail");
      this.assertTarget(ticket);
      const operation = this.operation(ticket);
      if (entry.action === "background" || entry.action === "btw") {
        start = this.receipts.begin(capture, entry.action, this.runtime.store.get(capture.sessionId).work.tasks);
      }
      const response = this.runtime.client.request(operation);
      sent = true;
      const result = await response;
      this.context.assert(capture);
      let receipt: ChatWorkResult;
      if (result.op === "work.subagent.interrupt" || result.op === "work.subagent.tail" || result.op === "work.process.kill") {
        if (result.data.id !== entry.targetId) throw new ChatError("PROTOCOL_MISMATCH", "Die Antwort gehört nicht zum angefragten Aufgabenziel.", result.op === "work.subagent.tail" ? "not_sent" : "unknown");
        if (result.op === "work.subagent.interrupt") receipt = { kind: "subagent.interrupt", ...result.data };
        else if (result.op === "work.subagent.tail") receipt = { kind: "subagent.tail", ...result.data };
        else receipt = { kind: "process.kill", ...result.data };
      } else if (result.op === "work.background" || result.op === "work.btw") {
        const kind = result.op === "work.background" ? "background" : "btw";
        if (result.data.kind !== kind) throw new ChatError("PROTOCOL_MISMATCH", "Die Nebenaufgabenantwort gehört nicht zur angefragten Art.", "unknown");
        receipt = { kind, taskId: result.data.taskId };
        const settlement = start ? this.receipts.settlement(start, result.data.taskId) : "unknown";
        this.runtime.store.update(capture.sessionId, (state) => ({ ...state, work: acceptedWorkTask(state.work, kind, result.data.taskId, settlement) }));
      } else if (result.op === "session.steer") {
        if (!["queued", "redirected", "rejected"].includes(result.data.status)) throw new ChatError("PROTOCOL_MISMATCH", "Die Steerantwort ist nicht bestätigt.", "unknown");
        receipt = { kind: "steer", status: result.data.status as "queued" | "redirected" | "rejected" };
      } else throw new ChatError("PROTOCOL_MISMATCH", "Die Aufgabenantwort passt nicht zur Aktion.", "unknown");
      this.confirm(ticket, receipt);
      if (entry.action !== "subagent.tail") this.refresh(capture.sessionId);
    } catch (error) {
      this.fail(ticket, sent && !this.context.valid(capture) ? new ChatError("CONTEXT_CHANGED", "Der Ausgang der Aufgabenaktion ist unklar.", entry.action === "subagent.tail" ? "not_sent" : "unknown") : error);
    } finally { if (start) this.receipts.finish(start); }
  }
  private assertTarget(ticket: WorkTicket): void {
    const { entry, capture } = ticket, work = this.runtime.store.get(capture.sessionId).work;
    if (entry.targetId !== null && (entry.action === "process.kill" ? !work.processes.some((row) => row.id === entry.targetId)
      : !work.subagents.some((row) => row.id === entry.targetId))) throw new ChatError("TARGET_UNAVAILABLE", "Dieses eigene Ziel ist nicht mehr belegt.");
  }
  private operation({ capture, entry }: WorkTicket): NativeOperation {
    const sessionId = capture.sessionId;
    if (entry.action === "subagent.interrupt") return { op: "work.subagent.interrupt", sessionId, subagentId: entry.targetId! };
    if (entry.action === "subagent.tail") return { op: "work.subagent.tail", sessionId, subagentId: entry.targetId! };
    if (entry.action === "process.kill") return { op: "work.process.kill", sessionId, processId: entry.targetId! };
    if (entry.action === "background") return { op: "work.background", sessionId, text: entry.text! };
    if (entry.action === "btw") return { op: "work.btw", sessionId, text: entry.text! };
    if (entry.action === "steer") return { op: "session.steer", sessionId, text: entry.text! };
    throw new ChatError("INVALID_MESSAGE", "Diese Aufgabenaktion ist nicht verfügbar.");
  }
  private local(owner: OwnerRecord): WorkLocal {
    let local = this.locals.get(owner);
    if (!local) { local = { entries: [], pending: new Map() }; this.locals.set(owner, local); }
    return local;
  }
  private emit(ticket: WorkTicket): void { this.runtime.owners.emit(ticket.capture.owner.owner); }
}
