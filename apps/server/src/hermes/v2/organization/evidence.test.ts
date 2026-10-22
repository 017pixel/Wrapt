import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { organizationFixture, rawRow, uid } from "./test-fixture.js";
import { EvidenceRegistry, BoundRegistry } from "./evidence.js";
import { notices } from "./queries.js";
import { linkEqual } from "./sources.js";

describe("exakte private Lesebelege", () => {
  let f: Awaited<ReturnType<typeof organizationFixture>>;
  beforeEach(async () => { f = await organizationFixture(); });
  afterEach(async () => { await f.close(); });
  it.each(["before", "after"])("Snapshot A, Fakt B %s Read liest ausschließlich A auch bei gleicher Millisekunde", (order) => {
    const token = f.handle(f.project([rawRow(1)]).messages[0]!);
    f.fact(1);
    if (order === "before") f.fact(2);
    f.read([token]);
    if (order === "after") f.fact(2);
    expect(f.view().attention.unreadCount).toBe(1);
    expect(f.repo.acknowledged("a", f.source(1).id)).toBe(true);
    expect(f.repo.acknowledged("a", f.source(2).id)).toBe(false);
  });
  it("ACK vor Fact-Ingest gilt nur für seine eingefrorene Source", () => {
    const token = f.handle(f.project([rawRow(1)]).messages[0]!);
    expect(f.read([token])).toMatchObject({ acknowledgedSources: 1, pendingSources: 1 });
    f.fact(2); f.fact(1);
    expect(f.view().attention.unreadCount).toBe(1);
    expect(f.repo.acknowledged("a", f.source(2).id)).toBe(false);
  });
  it("später dargestelltes B bestätigt weder früheres A noch fremden Owner", () => {
    f.fact(1); f.fact(2);
    f.read([f.handle(f.project([rawRow(2)]).messages[0]!)]);
    expect(f.view().attention.unreadCount).toBe(1);
    expect(f.view("b").attention.unreadCount).toBe(2);
  });
  it("vollständiger direkter Merge-Zeuge legt Source vor künftigem Fact an, spätere Zeugen erweitern keinen Handle", () => {
    const token = f.handle(f.project([rawRow(3, { absorbed_message_uids: [uid(1)] })]).messages[0]!);
    f.read([token]);
    f.fact(1); f.fact(2);
    f.project([rawRow(3, { absorbed_message_uids: [uid(1), uid(2)] })]);
    f.read([token]);
    expect(f.repo.acknowledged("a", f.source(1).id)).toBe(true);
    expect(f.repo.acknowledged("a", f.source(2).id)).toBe(false);
    expect(f.view().attention.unreadCount).toBe(1);
  });
  it("gerichtete Abdeckung vererbt keine ACKs und liest keine Fehlerquelle", () => {
    const a = f.source(1); const b = f.source(2);
    f.repo.run("INSERT INTO hermes_v2_source_links VALUES(?,?,'covers')", b.id, a.id);
    f.repo.run("INSERT INTO hermes_v2_source_links VALUES(?,?,'covers')", f.source(3).id, b.id);
    f.read([f.handle(f.project([rawRow(3)]).messages[0]!)]);
    expect(f.repo.acknowledged("a", a.id)).toBe(false);
    expect(f.repo.acknowledged("a", b.id)).toBe(false);
    expect(f.repo.acknowledged("a", f.source(3, "session", "error").id)).toBe(false);
  });
  it("gemischter abgelaufener Batch wird atomar ohne gültigen Teilread abgelehnt", () => {
    const old = f.handle(f.project([rawRow(1)]).messages[0]!);
    f.advance(15 * 60_000);
    const fresh = f.handle(f.project([rawRow(2)]).messages[0]!);
    expect(() => f.read([fresh, old])).toThrow();
    expect(f.repo.acknowledged("a", f.source(2).id)).toBe(false);
  });
  it("fremder Owner, Session, Scope und erratener Handle sind ungültig", () => {
    const token = f.handle(f.project([rawRow(1)]).messages[0]!);
    expect(() => f.read([token], "b")).toThrow();
    expect(() => f.read([token], "a", "other")).toThrow();
    expect(() => f.evidence.get(token, "a", "other-scope", "session")).toThrow();
    expect(() => f.read(["0".repeat(64)])).toThrow();
  });
  it("Projektion, Baseline und Sidebar führen keinen ACK aus; alte Clients haben kein neues Feld", () => {
    f.project([rawRow(1)]); f.fact(1); f.view();
    expect(f.repo.all("SELECT * FROM hermes_v2_read_acks")).toHaveLength(0);
    expect(f.project([rawRow(1)], "a", "session", false).messages[0]).not.toHaveProperty("readEvidence");
  });
  it("gekürzte Inhalte und ungültige UID tragen keinen Vollbeleg", () => {
    expect(f.project([rawRow(1, { content: "x".repeat(200_001) })]).messages[0]?.readEvidence).toBeNull();
    expect(f.project([rawRow(2, { message_uid: "invalid" })]).messages[0]?.readEvidence).toBeNull();
  });
  it("neue Row-ID mit derselben UID ist dieselbe Antwort, echter gleicher Text bleibt getrennt", () => {
    const first = f.project([rawRow(1, { content: "gleich" })]);
    f.read([f.handle(first.messages[0]!)]); f.fact(1);
    const copy = f.project([rawRow(100, { message_uid: uid(1), content: "gleich" }), rawRow(2, { content: "gleich" })]);
    expect(f.evidence.get(f.handle(copy.messages[0]!), "a", f.scope.id, "session")).toEqual([f.source(1).id]);
    f.fact(2); expect(f.view().attention.unreadCount).toBe(1);
  });
  it("Row-Reuse verändert weder alte Source noch akzeptierten ACK und schließt neue Belege", () => {
    const token = f.handle(f.project([rawRow(1)]).messages[0]!);
    f.read([token]);
    expect(f.project([rawRow(1, { message_uid: uid(2) })]).messages[0]?.readEvidence).toBeNull();
    expect(f.view().coverage.state).toBe("identity-unknown");
    expect(f.repo.acknowledged("a", f.source(1).id)).toBe(true);
  });
  it("historischer Fehler bekommt nach TTL/Registryrestart frische private Belege ohne Antwortalias", () => {
    f.fact(1, "decision-error"); f.advance(15 * 60_000);
    const freshRegistry = new EvidenceRegistry(f.now);
    const page = notices(f.repo, freshRegistry, "b", f.scope.id, "session", undefined, 100, f.now());
    expect(page.items[0]).toMatchObject({ kind: "historical-decision-error" });
    const error = f.source(1, "session", "error");
    const answer = f.source(1);
    linkEqual(f.repo, error, answer, f.now());
    const sources = freshRegistry.get(page.items[0]!.readEvidence!, "b", f.scope.id, "session");
    expect(sources).toEqual([error.id]);
    expect(() => freshRegistry.get(page.items[0]!.readEvidence!, "a", f.scope.id, "session")).toThrow();
    expect(f.repo.acknowledged("b", answer.id)).toBe(false);
    expect(JSON.stringify(page)).not.toContain("Antwort");
  });
  it("Neustart invalidiert Handles, Quellen/Fakten/ACKs bleiben in Wrapt erhalten", () => {
    const token = f.handle(f.project([rawRow(1)]).messages[0]!);
    f.read([token]); f.fact(1); f.repo.close();
    expect(f.view().attention.unreadCount).toBe(0);
    expect(() => new EvidenceRegistry(f.now).get(token, "a", f.scope.id, "session")).toThrow();
  });
  it("Registry begrenzt Owner/Global/TTL und kopiert Source-Mengen ohne spätere Erweiterung", () => {
    const registry = new BoundRegistry<string[]>(100, 2, 3, f.now);
    const a = registry.issue("a", "s", "x", ["a"]);
    registry.issue("a", "s", "x", ["b"]); registry.issue("a", "s", "x", ["c"]);
    expect(() => registry.get(a.handle, "a", "s", "x")).toThrow();
    expect(f.evidence.evidence("a", "s", "x", Array.from({ length: 65 }, (_, index) => String(index)))).toBeNull();
    const ids = ["one"]; const exact = f.evidence.evidence("a", "s", "x", ids)!; ids.push("two");
    expect(f.evidence.get(exact, "a", "s", "x")).toEqual(["one"]);
  });
  it("jüngere gelesene Antwort verdrängt älteren ungelesenen Entscheidungsfehler nicht als Grund", () => {
    f.fact(1, "decision-error"); f.fact(2);
    f.read([f.handle(f.project([rawRow(2)]).messages[0]!)]);
    expect(f.view().attention).toMatchObject({ unreadCount: 1, latest: { kind: "decision-error", unread: true } });
  });
});
