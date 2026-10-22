import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hermesV2SnapshotSchema } from "@wrapt/contracts/hermes-v2";
import { HermesClientError } from "../client.js";
import { clientMessage, securityFixture, type SecurityFixture } from "./security-test.fixture.js";

describe("Belegte Historie neuer und gespeicherter Hermes-Sitzungen", () => {
  let f: SecurityFixture;
  beforeEach(async () => { f = await securityFixture(); });
  afterEach(async () => { vi.restoreAllMocks(); await f.close(); });

  it("erstellt einen Chat ohne Historienabruf und liefert bei fehlender Speicherung eine leere Seite", async () => {
    const read = vi.spyOn(f.deps.dashboard, "get").mockRejectedValue(new HermesClientError("SESSION_NOT_FOUND", "Fehlt", 404));
    await f.manager.handle("tab", clientMessage({ op: "session.create", projectId: null }));
    const created = f.messages.findLast((entry) => entry.type === "result" && entry.op === "session.create");
    if (created?.type !== "result" || created.op !== "session.create") throw new Error("Neuer Chat fehlt");
    expect(created.data.snapshot).toMatchObject({ hasOlder: false, messages: [], session: { draft: true } });
    expect(read).not.toHaveBeenCalled();
    await f.manager.handle("tab", clientMessage({ op: "history.read", sessionId: created.data.snapshot.session.id }));
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "history.read", data: { messages: [], returned: 0, hasMore: false } });
    expect(f.messages.some((entry) => entry.type === "error")).toBe(false);
  });

  it.each([404, 410])("akzeptiert ausschließlich belegtes Fehlen (HTTP %i) als leere Historie", async (status) => {
    vi.spyOn(f.deps.dashboard, "get").mockRejectedValue(new HermesClientError("SESSION_NOT_FOUND", "Fehlt", status));
    await expect(f.manager.sessions.history("unknown", 100, 12)).resolves.toEqual({
      sessionId: "unknown", messages: [], offset: 12, returned: 0, hasMore: false,
    });
  });

  it.each([401, 403, 429, 500, 200, null])("verschluckt echte Lese- und Protokollfehler nicht (Status %s)", async (status) => {
    const error = new HermesClientError("DASHBOARD_UNREACHABLE", "Lesefehler", status);
    vi.spyOn(f.deps.dashboard, "get").mockRejectedValue(error);
    await expect(f.manager.sessions.history("a", 200, 0)).rejects.toBe(error);
  });

  it("vertraut weder geratenen Statusfeldern noch fehlerhaften Erfolgsantworten", async () => {
    const read = vi.spyOn(f.deps.dashboard, "get");
    const network = Object.assign(new Error("Netzwerk"), { status: 404 });
    read.mockRejectedValueOnce(network);
    await expect(f.manager.sessions.history("a", 200, 0)).rejects.toBe(network);
    for (const value of [{ session_id: "a", messages: null }, { session_id: "other", messages: [] }]) {
      read.mockResolvedValueOnce(value);
      await expect(f.manager.sessions.history("a", 200, 0)).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    }
  });

  it.each([0, 199, 200, 201, 450])("belegt weitere Historie bei %i Rohzeilen im vorhandenen Snapshot-Abruf", async (count) => {
    const session = f.gateway.seed("stored");
    session.messages = Array.from({ length: count }, (_, index) => ({ id: index + 1, role: "assistant", content: `Nachricht ${index + 1}` }));
    const read = vi.spyOn(f.deps.dashboard, "get");
    await f.manager.handle("tab", clientMessage({ op: "session.subscribe", sessionId: session.id }));
    const result = f.messages.findLast((entry) => entry.type === "result" && entry.op === "session.subscribe");
    if (result?.type !== "result" || result.op !== "session.subscribe") throw new Error("Snapshot fehlt");
    expect(result.data.snapshot.hasOlder).toBe(count > 200);
    expect(result.data.snapshot.messages).toHaveLength(Math.min(count, 200));
    if (count) expect(result.data.snapshot.messages[0]?.rowId).toBe(Math.max(1, count - 199));
    expect(read.mock.calls.filter(([path]) => path.includes("/messages?"))).toHaveLength(1);
    expect(read.mock.calls.find(([path]) => path.includes("/messages?"))?.[0]).toContain("limit=201");
    const { hasOlder: ignored, ...legacy } = result.data.snapshot;
    expect(ignored).toBe(count > 200);
    expect(hermesV2SnapshotSchema.safeParse(legacy).success).toBe(true);
  });

  it("behält Roh-Offsets und meldet eine exakt volle letzte Seite als vollständig", async () => {
    const session = f.gateway.seed("pages");
    session.messages = Array.from({ length: 400 }, (_, index) => ({ id: index + 1, role: "assistant", content: "Text" }));
    const latest = await f.manager.sessions.history(session.id, 200, 0);
    expect(latest).toMatchObject({ returned: 200, hasMore: true });
    expect(latest.messages.map((row) => row.rowId)).toEqual(Array.from({ length: 200 }, (_, index) => index + 201));
    const older = await f.manager.sessions.history(session.id, 200, latest.returned);
    expect(older).toMatchObject({ returned: 200, hasMore: false, offset: 200 });
    expect(older.messages.map((row) => row.rowId)).toEqual(Array.from({ length: 200 }, (_, index) => index + 1));
  });
});
