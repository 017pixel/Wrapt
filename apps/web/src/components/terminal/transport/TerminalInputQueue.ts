import type { ClientMessage } from "../terminal-types";

type InputMessage = Extract<ClientMessage, { type: "terminal.input" }>;
const INPUT_INTERVAL_MS = 60;
const INPUT_BLOCK_SIZE = 65_536;
const MAX_PENDING_CHARACTERS = 1_000_000;

/** Erste Taste sofort, schnelle Folgeereignisse als geordnete Blöcke. So
 * überschreitet ein Trackpad nicht den Flood-Schutz des gemeinsamen Sockets. */
export class TerminalInputQueue {
  private pending: InputMessage[] = [];
  private characters = 0;
  private lastSent = -Infinity;
  private timer: number | null = null;

  constructor(private readonly send: (message: ClientMessage) => boolean, private readonly onDiscard: (sessionIds: string[]) => void = () => {}) {}

  enqueue(message: InputMessage): boolean {
    if (this.characters + message.data.length > MAX_PENDING_CHARACTERS) return false;
    const previous = this.pending.at(-1);
    if (previous?.sessionId === message.sessionId && previous.data.length + message.data.length <= INPUT_BLOCK_SIZE) {
      previous.data += message.data;
    } else this.pending.push({ ...message });
    this.characters += message.data.length;
    if (Date.now() - this.lastSent >= INPUT_INTERVAL_MS) return this.flush();
    if (this.timer === null) {
      this.timer = window.setTimeout(() => { this.timer = null; this.flush(); }, INPUT_INTERVAL_MS - (Date.now() - this.lastSent));
    }
    return true;
  }

  flush(): boolean {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    const pending = this.pending;
    this.pending = [];
    this.characters = 0;
    for (const [index, message] of pending.entries()) {
      if (!this.send(message)) { this.onDiscard([...new Set(pending.slice(index).map((item) => item.sessionId))]); return false; }
      this.lastSent = Date.now();
    }
    return true;
  }

  /** Eingaben niemals nach einer Unterbrechung unbemerkt erneut ausführen. */
  reset(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    const discarded = [...new Set(this.pending.map((item) => item.sessionId))];
    this.pending = [];
    this.characters = 0;
    this.lastSent = -Infinity;
    if (discarded.length > 0) this.onDiscard(discarded);
  }
}
