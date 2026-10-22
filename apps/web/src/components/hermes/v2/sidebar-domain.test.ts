// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshot } from "./chat-test-fixtures";
import { activity, metadata, now } from "./organization-test-fixtures";
import { resolveSidebarRow, compareSidebarRows, withLocalActivity } from "./sidebar-resolver";
import { resolveSnooze, SidebarClock } from "./sidebar-time";
import { planSidebarDrop, validPinReorder } from "./sidebar-dnd";
import { SidebarPreferences } from "./sidebar-preferences";
import { organizationPolicy } from "./organization-policy";
import { OrganizationState } from "./organization-state";

describe("Sidebar-Domäne", () => {
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });
  it("ordnet jede Sitzung einmal ein und erhält Pins in allen höheren Gruppen", () => {
    const base = metadata("a", { pinRank: 0, effectiveSnoozedUntil: now + 1000, effectiveSettledAt: now - 1 });
    const row = (patch = {}) => resolveSidebarRow(snapshot().session, { ...base, ...patch }, activity({ state: "working" }), now);
    expect(row()).toMatchObject({ group: "snoozed", pinned: true });
    expect(row({ effectiveSnoozedUntil: null })).toMatchObject({ group: "settled", pinned: true });
    expect(row({ effectiveSnoozedUntil: null, effectiveSettledAt: null })).toMatchObject({ group: "pinned", pinned: true });
    expect(row({ attention: { unreadCount: 1, requiresAttention: true, latest: null } })).toMatchObject({ group: "needs-input", pinned: true });
    expect(resolveSidebarRow(null, base, activity({ state: "waiting_input" }), now).group).toBe("needs-input");
  });
  it("hält die Zeile mit lokalem Beleg in „In Arbeit“ und sonst beim Serverwert", () => {
    const idle = activity({ state: "idle" });
    expect(resolveSidebarRow(snapshot().session, metadata(), idle, now).group).toBe("active");
    expect(resolveSidebarRow(snapshot().session, metadata(), idle, now, { running: true })).toMatchObject({ group: "working", activity: "working" });
    // Eine offene Eingabe bleibt darüber: sie braucht den Nutzer.
    const waiting = resolveSidebarRow(snapshot().session, metadata(), activity({ state: "waiting_input" }), now, { running: true });
    expect(waiting.group).toBe("needs-input");
    // Der lokale Beleg zieht auch eine erledigte Zeile zurück nach „In Arbeit“.
    const settled = resolveSidebarRow(snapshot().session, metadata("a", { effectiveSettledAt: now - 1 }), null, now);
    expect(settled.group).toBe("settled");
    expect(withLocalActivity(settled)).toMatchObject({ group: "working", activity: "working" });
    expect(withLocalActivity(waiting).group).toBe("needs-input");
  });
  it("zieht einen alten Aufmerksamkeitsmarker vor, solange der Agent arbeitet", () => {
    // Der Marker "Turn beendet" stammt aus dem vorigen Turn. Während der
    // Agent nachweislich arbeitet, gehört die Zeile nach "In Arbeit" und
    // flackert nicht zwischen zwei Bereichen.
    const alt = metadata("a", { attention: { unreadCount: 1, requiresAttention: true, latest: null } });
    expect(resolveSidebarRow(snapshot().session, alt, activity({ state: "idle" }), now).group).toBe("needs-input");
    expect(resolveSidebarRow(snapshot().session, alt, activity({ state: "idle" }), now, { running: true }))
      .toMatchObject({ group: "working", activity: "working" });
    // Eine wirklich offene Eingabe bleibt darüber: sie braucht den Nutzer.
    expect(resolveSidebarRow(snapshot().session, alt, activity({ state: "waiting_input" }), now, { running: true }).group)
      .toBe("needs-input");
  });
  it("erfindet weder Runtimeaktivität, Startzeit noch Counts aus Summarydaten", () => {
    const row = resolveSidebarRow({ ...snapshot().session, running: false, startedAt: now - 10 }, metadata(), null, now);
    expect(row).toMatchObject({ activity: "unknown", durationMs: null, turnStartedAt: null, requestCount: null, subagentCount: null, backgroundCount: null });
    expect(resolveSidebarRow(null, metadata(), activity({ state: "starting" }), now)).toMatchObject({ group: "working", durationMs: null });
  });
  it("verwendet dauerhafte effektive Entwertung auch nach Read und bei gleichen Millisekunden", () => {
    const item = metadata("a", { snoozedUntil: now + 50_000, effectiveSnoozedUntil: null, settledAt: now, effectiveSettledAt: null });
    expect(resolveSidebarRow(null, item, null, now).group).toBe("active");
    const gap = { ...item, coverage: { state: "gap" as const, revision: 2, reason: "offline" }, organizationCoverageRevision: 1 };
    expect(resolveSidebarRow(null, gap, null, now).group).toBe("needs-input");
    expect(resolveSidebarRow(null, { ...gap, organizationCoverageRevision: 2 }, null, now).group).toBe("active");
    expect(resolveSidebarRow(null, { ...item, effectiveSnoozedUntil: now + 1 }, null, now).group).toBe("snoozed");
    expect(resolveSidebarRow(null, { ...item, effectiveSnoozedUntil: now + 1 }, null, now + 1).group).toBe("active");
  });
  it("sortiert Working nach belegtem Turnstart, bei Gleichstand stabil nach ID", () => {
    const first = resolveSidebarRow(snapshot("b").session, metadata("b"), activity({ state: "working", turnStartedAt: 20 }), now);
    const second = resolveSidebarRow(snapshot().session, metadata(), activity({ state: "working", turnStartedAt: 20 }), now);
    expect([first, second].sort(compareSidebarRows).map((row) => row.id)).toEqual(["a", "b"]);
    expect(compareSidebarRows({ ...first, turnStartedAt: 21 }, second)).toBeLessThan(0);
  });
  it("verweigert gefilterte/duplizierte/veraltete Pinreihenfolgen und erhält die volle Menge", () => {
    const pins = ["a", "b", "c"].map((id, rank) => resolveSidebarRow(null, metadata(id, { pinRank: rank, revision: rank }), null, now));
    expect(planSidebarDrop(pins[0]!, "pinned", pins.slice(0, 2), false, 0).allowed).toBe(false);
    const plan = planSidebarDrop(pins[0]!, "pinned", pins, true, 0, "c");
    expect(plan.allowed && plan.kind === "reorder" && plan.command.entries.map((entry) => entry.sessionId)).toEqual(["b", "a", "c"]);
    if (!plan.allowed || plan.kind !== "reorder") throw Error("plan");
    expect(validPinReorder(plan.command, pins, true, 0)).toBe(true);
    expect(validPinReorder({ ...plan.command, entries: plan.command.entries.slice(1) }, pins, true, 0)).toBe(false);
    expect(validPinReorder({ ...plan.command, entries: [plan.command.entries[0]!, plan.command.entries[0]!, plan.command.entries[2]!] }, pins, true, 0)).toBe(false);
    expect(validPinReorder(plan.command, pins, true, 1)).toBe(false);
  });
  it("prüft DST-Lücke, doppelte Ortszeit, expliziten Offset und Kalenderdatum", () => {
    const timeZone = "Europe/Berlin", before = Date.parse("2026-01-01T00:00:00Z");
    expect(resolveSnooze({ preset: "custom", date: "2026-03-29", time: "02:30", timeZone }, before)).toMatchObject({ ok: false, code: "NONEXISTENT_TIME" });
    const fold = resolveSnooze({ preset: "custom", date: "2026-10-25", time: "02:30", timeZone }, before);
    expect(fold).toMatchObject({ ok: false, code: "AMBIGUOUS_TIME" });
    expect(resolveSnooze({ preset: "custom", date: "2026-10-25", time: "02:30", timeZone, offsetMinutes: 60 }, before)).toMatchObject({ ok: true, until: Date.parse("2026-10-25T01:30:00Z") });
    expect(resolveSnooze({ preset: "custom", date: "2026-02-30", time: "02:30", timeZone }, before)).toMatchObject({ ok: false, code: "INVALID_TIME" });
  });
  it("berechnet Abend/Morgen in der gewählten Zeitzone und begrenzt Custom", () => {
    const start = Date.parse("2026-10-24T23:30:00Z"), timeZone = "Europe/Berlin";
    expect(resolveSnooze({ preset: "tomorrow", timeZone }, start)).toMatchObject({ ok: true, until: Date.parse("2026-10-26T08:00:00Z") });
    expect(resolveSnooze({ preset: "30m", timeZone }, start)).toMatchObject({ ok: true, until: start + 1_800_000 });
    expect(resolveSnooze({ preset: "custom", date: "2026-01-01", time: "12:00", timeZone }, start)).toMatchObject({ ok: false, code: "OUT_OF_RANGE" });
    expect(resolveSnooze({ preset: "evening", timeZone: "bad/zone" }, start).ok).toBe(false);
  });
  it("benutzt eine monotone Serveruhr und genau einen Darstellungstimer", () => {
    vi.useFakeTimers(); let monotonic = 0; const clock = new SidebarClock(() => monotonic); clock.sample(now);
    vi.setSystemTime(0); monotonic = 900; expect(clock.now()).toBe(now + 900);
    clock.sample(now - 1000); expect(clock.now()).toBe(now + 900);
    const notify = vi.fn(); clock.schedule([now + 1000], true, notify); clock.schedule([now + 1000], true, notify);
    expect(vi.getTimerCount()).toBe(1); vi.advanceTimersByTime(100); expect(notify).toHaveBeenCalledOnce();
    clock.stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it("synchronisiert nur versionierte Bool-Preferences ohne Tab-Echo", () => {
    const preferences = new SidebarPreferences(), notify = vi.fn(); preferences.start(notify);
    const write = vi.spyOn(localStorage, "setItem");
    window.dispatchEvent(new StorageEvent("storage", { key: organizationPolicy.preferencesKey, newValue: JSON.stringify({ version: 1, collapsed: { working: "false", snoozed: false } }) }));
    expect(preferences.value).toEqual({ working: false, snoozed: false, settled: true }); expect(write).not.toHaveBeenCalled();
    preferences.set("working", true); expect(write).toHaveBeenCalledOnce(); preferences.dispose(); write.mockRestore();
  });
  it("behält unveränderte Rows zwischen Token-unabhängigen Projektionen und begrenzt Revisionen", () => {
    const state = new OrganizationState(); state.mergeMetadata([metadata("a", { revision: 2 })]);
    state.mergeMetadata([metadata("a", { revision: 1 })]);
    const one = state.rows(["a", "a"], now); expect(one).toHaveLength(1); expect(one[0]!.metadata.revision).toBe(2);
    expect(state.rows(["a"], now + 1000)[0]).toBe(one[0]);
  });
});
