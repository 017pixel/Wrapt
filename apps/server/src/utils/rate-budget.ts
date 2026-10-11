/**
 * Kleines festes Zeitfenster-Budget gegen Flood und Spam.
 *
 * Bewusst kein Sliding-Window und kein verteilter Zähler: Die Budgets gelten
 * pro Prozess und pro Schlüssel (Identität, Slot oder Socket). Für
 * Proxy-/Gateway-Pfade reicht das, weil alle Tabs hinter Tailscale dieselbe
 * Loopback-IP haben und das Limit deshalb pro Identität/Slot zählt.
 */
export interface RateBudgetOptions {
  /** Erlaubte Ereignisse pro Fenster. */
  maxEvents: number;
  /** Fensterlänge in Millisekunden. */
  windowMilliseconds: number;
  /** Zeitquelle, nur für Tests überschreibbar. */
  now?: () => number;
}

export class RateBudget {
  private readonly maxEvents: number;
  private readonly windowMilliseconds: number;
  private readonly now: () => number;
  private readonly counters = new Map<string, { windowStart: number; count: number }>();

  constructor(options: RateBudgetOptions) {
    this.maxEvents = options.maxEvents;
    this.windowMilliseconds = options.windowMilliseconds;
    this.now = options.now ?? Date.now;
  }

  /**
   * Versucht, ein Ereignis für `key` zu verbuchen. Gibt `true` zurück, solange
   * das Budget reicht, sonst `false` (Aufrufer antwortet 429 bzw. schließt).
   */
  tryConsume(key: string): boolean {
    const timestamp = this.now();
    const entry = this.counters.get(key);
    if (!entry || timestamp - entry.windowStart >= this.windowMilliseconds) {
      this.counters.set(key, { windowStart: timestamp, count: 1 });
      return true;
    }
    if (entry.count >= this.maxEvents) return false;
    entry.count += 1;
    return true;
  }

  /** Aktueller Zählerstand, nur für Tests und Diagnose. */
  countOf(key: string): number {
    const entry = this.counters.get(key);
    if (!entry || this.now() - entry.windowStart >= this.windowMilliseconds) return 0;
    return entry.count;
  }
}
