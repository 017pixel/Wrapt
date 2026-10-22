import { describe, expect, it, vi } from "vitest";
import { OrganizationClient } from "./organization-client";
import { organizationPolicy } from "./organization-policy";
import { evidenceA, jsonResponse, metadata, now } from "./organization-test-fixtures";
import { snapshot } from "./chat-test-fixtures";

const signal = () => new AbortController().signal;
const clientFor = (value: unknown, status = 200) => new OrganizationClient(vi.fn(async () => jsonResponse(value, status)));
describe("Organisations-RESTvertrag", () => {
  it("bindet Katalogseiten und Activity an die angeforderte Seite", async () => {
    const page = { sessions: [snapshot().session], activity: {}, offset: 0, limit: 100, nextOffset: null, hasMore: false, coverage: "complete", serverNow: now };
    await expect(clientFor(page).catalog({ offset: 0, limit: 100 }, signal())).resolves.toMatchObject({ offset: 0 });
    await expect(clientFor({ ...page, offset: 100 }).catalog({ offset: 0, limit: 100 }, signal())).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    await expect(clientFor({ ...page, limit: 50 }).catalog({ offset: 0, limit: 100 }, signal())).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    const foreignActivity = { state: "unknown", turnStartedAt: null, openRequestCount: null, subagentCount: null, backgroundCount: null, observedAt: now, coverage: "partial" };
    await expect(clientFor({ ...page, activity: { b: foreignActivity } }).catalog({ offset: 0, limit: 100 }, signal())).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
  });
  it("bindet Lookup, Metadaten, Hinweise und Einzelaktionen an Ziel-IDs", async () => {
    await expect(clientFor([metadata("b")]).metadata(["a"], signal())).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    await expect(clientFor({ sessions: [snapshot("b").session], activity: {}, missingSessionIds: [], serverNow: now }).lookup(["a"], signal())).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    await expect(clientFor({ sessionId: "b", items: [], hasMore: false, nextCursor: null, serverNow: now }).notices("a", null, signal())).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    await expect(clientFor({ items: [metadata("b")], undo: null, serverNow: now }).action({ sessionId: "a", action: "pin", expectedRevision: 0 }, signal())).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH", outcome: "unknown" });
    await expect(clientFor({ items: [metadata("b"), metadata("a")], undo: null, serverNow: now }).reorder({ expectedPinRevision: 0,
      entries: [{ sessionId: "a", expectedRevision: 0 }, { sessionId: "b", expectedRevision: 0 }] }, signal())).resolves.toHaveProperty("items.length", 2);
  });
  it("übernimmt strukturierten Konfliktstand und feste deutsche Domänenfehler", async () => {
    await expect(clientFor({ code: "ORGANIZATION_CONFLICT", items: [metadata()], pinRevision: 2, serverNow: now }, 409)
      .action({ sessionId: "a", action: "pin", expectedRevision: 0 }, signal())).rejects.toMatchObject({ code: "ORGANIZATION_CONFLICT", data: { pinRevision: 2 } });
    for (const code of ["OPEN_REQUEST", "PIN_LIMIT", "INVALID_SNOOZE"]) {
      await expect(clientFor({ code, message: "secret payload" }, 400).action({ sessionId: "a", action: "pin", expectedRevision: 0 }, signal())).rejects.toMatchObject({ code });
    }
    await expect(clientFor({ code: "OPEN_REQUEST" }, 409).action({ sessionId: "a", action: "snooze", expectedRevision: 0, snoozedUntil: now + 1000 }, signal())).rejects.toThrow("zuerst die offene Anfrage beantworten");
  });
  it("bricht einen tatsächlich gestreamten Body vor Überschreiten der Speichergrenze ab", async () => {
    const cancel = vi.fn(); let chunks = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(1_048_576)); }, cancel });
    const client = new OrganizationClient(async () => new Response(body));
    await expect(client.metadata(["a"], signal())).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    expect(cancel).toHaveBeenCalledOnce(); expect(chunks).toBeLessThanOrEqual(6);
  });
  it("begrenzt hängende Bodyreads und verwirft abgebrochene Mutationsresultate ohne Retry", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(); const fetcher = vi.fn(async () => new Response(new ReadableStream({ cancel })));
      const client = new OrganizationClient(fetcher);
      const result = client.action({ sessionId: "a", action: "pin", expectedRevision: 0 }, signal());
      const assertion = expect(result).rejects.toMatchObject({ outcome: "unknown" });
      await vi.advanceTimersByTimeAsync(organizationPolicy.requestTimeoutMs);
      await assertion; expect(cancel).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("sendet ausschließlich exakte Handles ohne Cursor-/Browserprincipal-Felder", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ revision: 0, acknowledgedSources: 1, pendingSources: 1, readFactIds: [], serverNow: now }));
    await new OrganizationClient(fetcher).read("a", [evidenceA], signal());
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ sessionId: "a", evidence: [evidenceA] });
  });
});
