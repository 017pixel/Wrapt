import { GatewayError } from "../errors.js";
import type { SessionRecord } from "../types.js";

interface Receipt { kind: "background" | "btw"; completed: Set<string>; overflow: boolean }
/** Offene RPCs behalten Settlement unabhängig von der begrenzten sichtbaren Aufgabenliste. */
export class TaskReceipts {
  private records = new WeakMap<SessionRecord, Set<Receipt>>();
  private pending = 0;
  constructor(private limit: number) {}
  begin(record: SessionRecord, kind: Receipt["kind"]): Receipt {
    if (this.pending >= this.limit) throw new GatewayError("RATE_LIMITED", "Zu viele offene Nebenaufgabenquittungen.");
    const receipt: Receipt = { kind, completed: new Set(), overflow: false };
    const entries = this.records.get(record) ?? new Set(); entries.add(receipt); this.records.set(record, entries);
    this.pending++; return receipt;
  }
  complete(record: SessionRecord, kind: Receipt["kind"], id: string): void {
    for (const receipt of this.records.get(record) ?? []) if (receipt.kind === kind) {
      if (receipt.completed.size < this.limit || receipt.completed.has(id)) receipt.completed.add(id);
      else receipt.overflow = true;
    }
  }
  status(receipt: Receipt, id: string): "running" | "completed" | "unknown" {
    return receipt.completed.has(id) ? "completed" : receipt.overflow ? "unknown" : "running";
  }
  end(record: SessionRecord, receipt: Receipt): void {
    const entries = this.records.get(record);
    if (!entries?.delete(receipt)) return;
    this.pending--; if (!entries.size) this.records.delete(record);
  }
  clear(): void { this.records = new WeakMap(); this.pending = 0; }
}
