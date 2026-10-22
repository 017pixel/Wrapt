import { organizationPolicy } from "./organization-policy";
import type { SnoozeInput, SnoozeResolution } from "./sidebar-types";

function localParts(instant: number, timeZone: string): number[] {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  return ["year", "month", "day", "hour", "minute", "second"].map((type) => Number(parts.find((part) => part.type === type)?.value));
}
function utc(parts: readonly number[]): number {
  return Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!, parts[3] ?? 0, parts[4] ?? 0, parts[5] ?? 0);
}
export function resolveSnooze(input: SnoozeInput, now: number): SnoozeResolution {
  const invalid = (code: "INVALID_TIME" | "NONEXISTENT_TIME" | "AMBIGUOUS_TIME" | "OUT_OF_RANGE", message: string,
    alternatives: readonly { until: number; offsetMinutes: number }[] = []): SnoozeResolution => ({ ok: false, code, message, alternatives });
  try {
    const current = localParts(now, input.timeZone);
    if (input.preset === "30m" || input.preset === "1h") return { ok: true, until: now + (input.preset === "30m" ? 1_800_000 : 3_600_000), timeZone: input.timeZone };
    let target: number[];
    if (input.preset === "custom") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) return invalid("INVALID_TIME", "Datum und Uhrzeit sind ungültig.");
      target = [...input.date.split("-").map(Number), ...input.time.split(":").map(Number), 0];
    } else {
      target = [...current.slice(0, 3), input.preset === "evening" ? 20 : 9, 0, 0];
      if (input.preset === "tomorrow" || current[3]! >= 20) {
        const day = new Date(utc(target) + 86_400_000);
        target = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), target[3]!, 0, 0];
      }
    }
    const requested = utc(target);
    const sanity = new Date(requested);
    if (target[0]! < 1970 || sanity.getUTCFullYear() !== target[0] || sanity.getUTCMonth() + 1 !== target[1]
      || sanity.getUTCDate() !== target[2] || target[3]! > 23 || target[4]! > 59) return invalid("INVALID_TIME", "Datum und Uhrzeit sind ungültig.");
    const offsets = new Set<number>();
    for (let hours = -48; hours <= 48; hours += 6) {
      const probe = requested + hours * 3_600_000;
      offsets.add((utc(localParts(probe, input.timeZone)) - probe) / 60_000);
    }
    let alternatives = [...offsets].map((offsetMinutes) => ({ until: requested - offsetMinutes * 60_000, offsetMinutes }))
      .filter((entry) => localParts(entry.until, input.timeZone).every((value, index) => value === target[index]))
      .sort((a, b) => a.until - b.until);
    if (!alternatives.length) return invalid("NONEXISTENT_TIME", "Diese Ortszeit existiert wegen der Zeitumstellung nicht.");
    if (input.preset === "custom" && input.offsetMinutes !== undefined) alternatives = alternatives.filter((entry) => entry.offsetMinutes === input.offsetMinutes);
    if (alternatives.length > 1) return invalid("AMBIGUOUS_TIME", "Diese Ortszeit kommt zweimal vor. Bitte den UTC-Versatz wählen.", alternatives);
    const until = alternatives[0]?.until;
    if (until === undefined) return invalid("INVALID_TIME", "Der UTC-Versatz passt nicht zur Ortszeit.");
    if (until <= now || until - now > organizationPolicy.maxSnoozeMs) return invalid("OUT_OF_RANGE", "Snooze muss in der Zukunft und innerhalb eines Jahres liegen.");
    return { ok: true, until, timeZone: input.timeZone };
  } catch { return invalid("INVALID_TIME", "Die Zeitzone oder Ortszeit ist ungültig."); }
}
/** Eine gemeinsame, ausschließlich darstellende Uhr; sie löst keine HTTP-Anfragen aus. */
export class SidebarClock {
  private anchor: { server: number; monotonic: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly monotonic = () => performance.now()) {}
  now(): number { return this.anchor ? this.anchor.server + Math.max(0, this.monotonic() - this.anchor.monotonic) : Date.now(); }
  sample(serverNow: number): void {
    this.anchor = { server: this.anchor ? Math.max(this.now(), serverNow) : serverNow, monotonic: this.monotonic() };
  }
  schedule(deadlines: readonly number[], working: boolean, notify: () => void): void {
    this.stop();
    const now = this.now();
    const delays = deadlines.filter((deadline) => deadline > now).map((deadline) => deadline - now);
    if (working) delays.push(organizationPolicy.workingTickMs);
    if (delays.length) this.timer = setTimeout(() => { this.timer = null; notify(); }, Math.max(1, Math.min(...delays, 2_147_483_647)));
  }
  stop(): void { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }
}
