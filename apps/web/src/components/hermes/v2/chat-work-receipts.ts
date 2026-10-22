import type { HermesV2WorkPatch, HermesV2WorkTask } from "@wrapt/contracts/hermes-v2";
import type { OwnerRecord } from "./chat-owners";
import type { ChatWorkContext, WorkCapture } from "./chat-work-context";
import { chatPolicy } from "./chat-policy";
import { ChatError } from "./gateway-protocol";

export interface WorkStartReceipt {
  capture: WorkCapture;
  kind: "background" | "btw";
  completed: Set<string>;
  overflow: boolean;
}
/** Nur offene Startkorrelationen, unabhängig vom begrenzten sichtbaren Roster. */
export class ChatWorkReceipts {
  private pending = new Set<WorkStartReceipt>();
  constructor(private readonly context: ChatWorkContext) {}
  get size(): number { return this.pending.size; }
  begin(capture: WorkCapture, kind: WorkStartReceipt["kind"], tasks: readonly HermesV2WorkTask[]): WorkStartReceipt {
    this.prune(); this.context.assert(capture, true);
    if (this.pending.size >= chatPolicy.maxPending) throw new ChatError("CLIENT_BUSY", "Zu viele offene Nebenaufgabenstarts.");
    const receipt: WorkStartReceipt = { capture, kind, completed: new Set(), overflow: false };
    this.pending.add(receipt);
    for (const task of tasks) this.remember(receipt, task);
    return receipt;
  }
  observe(sessionId: string, changes: readonly HermesV2WorkPatch[]): void {
    this.prune();
    for (const receipt of this.pending) if (receipt.capture.sessionId === sessionId) {
      for (const change of changes) this.remember(receipt, change);
    }
  }
  settlement(receipt: WorkStartReceipt, id: string): "running" | "completed" | "unknown" {
    if (!this.pending.has(receipt)) return "unknown";
    if (receipt.completed.has(id)) return "completed";
    return receipt.overflow ? "unknown" : "running";
  }
  finish(receipt: WorkStartReceipt): void { this.pending.delete(receipt); receipt.completed.clear(); }
  invalidate(owner: OwnerRecord): void {
    for (const receipt of this.pending) if (receipt.capture.owner.owner === owner) this.finish(receipt);
  }
  prune(): void {
    for (const receipt of this.pending) if (!this.context.valid(receipt.capture)) this.finish(receipt);
  }
  dispose(): void { for (const receipt of this.pending) this.finish(receipt); }
  private remember(receipt: WorkStartReceipt, change: HermesV2WorkPatch): void {
    if (change.kind !== receipt.kind || change.status !== "completed" || !("id" in change) || receipt.completed.has(change.id)) return;
    if (receipt.completed.size >= chatPolicy.maxPending) { receipt.overflow = true; return; }
    receipt.completed.add(change.id);
  }
}
