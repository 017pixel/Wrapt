import type { TerminalSession } from "../session.js";

export interface RespawnState {
  attempts: number;
  timer: NodeJS.Timeout | null;
  stable: NodeJS.Timeout | null;
  input: PendingInputBuffer;
}

/** Begrenzte FIFO-Pufferung. Bei Überlauf werden die ältesten Eingaben verworfen. */
export class PendingInputBuffer {
  private chunks: string[] = [];
  private size = 0;

  constructor(private readonly limit: number) {}

  get length(): number { return this.size; }

  push(data: string): void {
    if (!data || this.limit <= 0) return;
    const retained = data.length > this.limit ? data.slice(-this.limit) : data;
    while (this.chunks.length > 0 && this.size + retained.length > this.limit) {
      const removed = this.chunks.shift();
      if (removed) this.size -= removed.length;
    }
    this.chunks.push(retained);
    this.size += retained.length;
  }

  drain(): string[] {
    const chunks = this.chunks;
    this.chunks = [];
    this.size = 0;
    return chunks;
  }

  clear(): void {
    this.chunks = [];
    this.size = 0;
  }
}

/** Setzt eine neue Runtime-Emulation auf eine gemeinsame Sequenzbasis. */
export function resetRuntimeScreen(session: TerminalSession, advanceEpoch: boolean): void {
  if (advanceEpoch) session.epoch += 1;
  session.sequence = 0;
  session.history = "";
  session.exitCode = null;
  session.exitSignal = null;
  session.journal.clear();
  session.headless?.reset(0);
  session.updatedAt = Date.now();
  session.lastPersistedAt = undefined;
}
