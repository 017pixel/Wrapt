import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { organizationFixture, rawRow } from "./test-fixture.js";
import { members } from "./queries.js";
import { organizationPolicy } from "./policy.js";

describe("private Organisation, dauerhafter Wake und CAS", () => {
  let f: Awaited<ReturnType<typeof organizationFixture>>;
  beforeEach(async () => { f = await organizationFixture(); });
  afterEach(async () => { await f.close(); });
  const input = (action: "pin" | "unpin" | "wake" | "settle" | "unsettle") => ({ sessionId: "session", expectedRevision: f.view().revision, action });
  const snooze = () => f.actions.action("a", f.scope.id, { sessionId: "session", expectedRevision: f.view().revision, action: "snooze", snoozedUntil: f.now() + 3600_000 });
  it("bekannte ungelesene Antwort ist organisierbar ohne ACK, neue Antwort weckt dauerhaft auch nach Read", () => {
    f.fact(1); snooze();
    expect(f.view().effectiveSnoozedUntil).not.toBeNull();
    expect(f.view().attention.requiresAttention).toBe(false);
    expect(f.repo.acknowledged("a", f.source(1).id)).toBe(false);
    f.fact(2);
    expect(f.view().effectiveSnoozedUntil).toBeNull();
    f.read([f.handle(f.project([rawRow(2)]).messages[0]!)]);
    expect(f.view().effectiveSnoozedUntil).toBeNull();
    snooze(); expect(f.view().effectiveSnoozedUntil).not.toBeNull();
  });
  it("Settle stoppt nichts; neue Fakten und unentschiedene gleiche Millisekunde entwerten es", () => {
    const result = f.actions.action("a", f.scope.id, input("settle"));
    expect(result.items).toHaveLength(1);
    f.fact(1);
    expect(f.view().effectiveSettledAt).toBeNull();
    expect(f.view().settledAt).not.toBeNull();
  });
  it("belegt vor der Aktion abgeschlossene verspätete Antwort bleibt alt", () => {
    f.actions.action("a", f.scope.id, input("settle"));
    f.fact(1, "new-answer", f.now() - 1);
    expect(f.view().effectiveSettledAt).not.toBeNull();
    expect(f.view().attention.requiresAttention).toBe(false);
  });
  it("gleiche ursprüngliche Abschlussmillisekunde bleibt konservativ sichtbar", () => {
    f.actions.action("a", f.scope.id, input("settle"));
    f.fact(1, "new-answer", f.now());
    expect(f.view().effectiveSettledAt).toBeNull();
  });
  it("Entscheidungsfehler bleibt nach Snooze/Settle relevant, offener Request verweigert Snooze", () => {
    f.fact(1, "decision-error"); snooze();
    expect(f.view().attention).toMatchObject({ requiresAttention: true, latest: { kind: "decision-error", relevant: true } });
    f.requests(true);
    expect(snooze).toThrow(/Anfrage/);
  });
  it("Pins und private Orgwerte werden keinem anderen Principal übernommen", () => {
    f.actions.action("a", f.scope.id, input("pin")); snooze();
    expect(f.view("b")).toMatchObject({ pinRank: null, snoozedUntil: null, settledAt: null });
    expect(f.view().pinRank).toBe(0);
  });
  it("parallele CAS-Aktion und neuer gemeinsamer Fakt überschreiben nichts", () => {
    const before = input("settle");
    f.actions.action("a", f.scope.id, before);
    expect(() => f.actions.action("a", f.scope.id, before)).toThrow(/inzwischen/);
    const again = input("wake"); f.fact(1);
    expect(() => f.actions.action("a", f.scope.id, again)).toThrow(/inzwischen/);
    expect(f.view().settledAt).not.toBeNull();
  });
  it("Undo ist privat, zehn Sekunden gültig und stellt keine ACKs/Fakten zurück", () => {
    const result = f.actions.action("a", f.scope.id, input("pin"));
    expect(() => f.actions.restore("b", f.scope.id, result.undo!.handle)).toThrow();
    f.actions.restore("a", f.scope.id, result.undo!.handle);
    expect(f.view().pinRank).toBeNull();
    expect(() => f.actions.restore("a", f.scope.id, result.undo!.handle)).toThrow();
    const again = f.actions.action("a", f.scope.id, input("pin")); f.advance(10_000);
    expect(() => f.actions.restore("a", f.scope.id, again.undo!.handle)).toThrow();
  });
  it.each(["read", "fact", "action"])("Undo nach %s kann neuere Revision nicht zurücksetzen", (kind) => {
    const result = f.actions.action("a", f.scope.id, input("settle"));
    if (kind === "read") f.read([f.handle(f.project([rawRow(1)]).messages[0]!)]);
    if (kind === "fact") f.fact(1);
    if (kind === "action") f.actions.action("a", f.scope.id, input("wake"));
    expect(() => f.actions.restore("a", f.scope.id, result.undo!.handle)).toThrow(/inzwischen/);
  });
  it("Reorder verlangt atomar vollständige Pinmenge und alle aktuellen Revisionen", () => {
    f.actions.action("a", f.scope.id, input("pin"));
    f.actions.action("a", f.scope.id, { sessionId: "two", expectedRevision: 0, action: "pin" });
    const before = members(f.repo, "a", f.scope.id, "pinned", undefined, 100, f.now());
    const entries = before.items.map((row) => ({ sessionId: row.sessionId, expectedRevision: row.revision })).reverse();
    expect(() => f.actions.reorder("a", f.scope.id, { expectedPinRevision: before.pinRevision, entries: entries.slice(0, 1) })).toThrow();
    expect(() => f.actions.reorder("a", f.scope.id, { expectedPinRevision: before.pinRevision, entries: [entries[0]!, entries[0]!] })).toThrow();
    const changed = f.actions.reorder("a", f.scope.id, { expectedPinRevision: before.pinRevision, entries });
    expect(changed.items.find((row) => row.sessionId === "two")?.pinRank).toBe(0);
    f.actions.restore("a", f.scope.id, changed.undo!.handle);
    expect(f.view().pinRank).toBe(0);
  });
  it("Membershipcursor bindet Gruppe und private Listenrevision; fremde Änderung liest keinen Mischstand", () => {
    f.actions.action("a", f.scope.id, input("pin"));
    f.actions.action("a", f.scope.id, { sessionId: "two", expectedRevision: 0, action: "pin" });
    const first = members(f.repo, "a", f.scope.id, "pinned", undefined, 1, f.now());
    expect(first.hasMore).toBe(true);
    expect(() => members(f.repo, "a", f.scope.id, "settled", first.nextCursor!, 1, f.now())).toThrow();
    f.fact(1);
    expect(() => members(f.repo, "a", f.scope.id, "pinned", first.nextCursor!, 1, f.now())).toThrow(/inzwischen/);
    expect(members(f.repo, "b", f.scope.id, "pinned", undefined, 1, f.now()).items).toEqual([]);
  });
  it("unveränderter Gap weckt nach bewusster Organisation nicht erneut, neue Lücke schon", () => {
    f.repo.transaction(() => f.repo.setCoverage(f.scope.id, "session", "gap", "ANCHOR_MISSING", "one", f.now()));
    snooze();
    f.repo.transaction(() => f.repo.setCoverage(f.scope.id, "session", "gap", "ANCHOR_MISSING", "one", f.now()));
    expect(f.view().effectiveSnoozedUntil).not.toBeNull();
    f.repo.transaction(() => f.repo.setCoverage(f.scope.id, "session", "gap", "ANCHOR_MISSING", "two", f.now()));
    expect(f.view().effectiveSnoozedUntil).toBeNull();
  });
  it("verlorene Antwort ist nur Lücke; belegte Wiederverfügbarkeit weckt denselben ungelesenen Fakt", () => {
    f.fact(1);
    f.repo.run("UPDATE hermes_v2_sources SET available=0 WHERE id=?", f.source(1).id);
    f.repo.transaction(() => f.repo.setCoverage(f.scope.id, "session", "gap", "UNAVAILABLE_CONTENT", "one", f.now()));
    expect(f.view().attention.unreadCount).toBe(0);
    snooze();
    f.repo.transaction(() => f.repo.markAvailable(f.source(1), f.now()));
    expect(f.view()).toMatchObject({ effectiveSnoozedUntil: null, attention: { unreadCount: 1, requiresAttention: true } });
    f.repo.transaction(() => f.repo.setCoverage(f.scope.id, "session", "anchored", null, "one", f.now()));
    expect(f.view().effectiveSnoozedUntil).toBeNull();
  });
  it("Snoozegrenze ist zentral und abgelaufene, zu große Zeiten bleiben abgewiesen", () => {
    for (const until of [f.now(), f.now() + organizationPolicy.snoozeMaxMs + 1]) expect(() => f.actions.action("a", f.scope.id,
      { sessionId: "session", expectedRevision: f.view().revision, action: "snooze", snoozedUntil: until })).toThrow();
  });
});
