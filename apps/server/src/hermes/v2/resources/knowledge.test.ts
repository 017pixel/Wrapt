import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { resourceFixture } from "./resource.fixture.js";

const record = (id: string, extra: Record<string, unknown> = {}) => ({ id, subsystem: "memory", action: "replace", summary: "Vorschlag", origin: "background_review", created_at: 1_700_000_000,
  payload: { action: "replace", matched_entry: "Alter vollständiger Eintrag", replacement: "Neu" }, ...extra });
describe("V2-Knowledgeprojektionen", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); }); afterEach(async () => { await f.close(); });
  it("trennt fehlende, leere und verfügbare Builtindateien von externen Providern", async () => {
    await writeFile(join(f.root, "memories/USER.md"), "");
    const result = await f.request("GET", "/memory"); expect(result.statusCode).toBe(200); const data = result.json();
    expect(data.builtinOnly).toBe(true); expect(data.files).toEqual([{ name: "MEMORY.md", status: "missing", bytes: null, text: null, truncated: false }, { name: "USER.md", status: "empty", text: "", bytes: 0, truncated: false }]);
    expect(data.providers[0].name).toBe("external"); expect(JSON.stringify(data)).not.toContain("private-value"); expect(f.writes).toHaveLength(0);
  });
  it("liest höchstens64KiB und markiert echte Kürzung", async () => {
    await writeFile(join(f.root, "memories/MEMORY.md"), "ä".repeat(40_000));
    const result = (await f.request("GET", "/memory")).json(); expect(result.truncated).toBe(true); expect(result.files[0].truncated).toBe(true); expect(Buffer.byteLength(result.files[0].text)).toBeLessThanOrEqual(65_536);
  });
  it("folgt weder Datei- noch Elternsymlinks und nimmt keine Browserpfade an", async () => {
    await symlink("/etc/passwd", join(f.root, "memories/MEMORY.md"));
    const result = (await f.request("GET", "/memory")).json(); expect(result.files[0].text).toBe(null); expect(result.files[0].status).toBe("unknown");
    expect((await f.request("GET", "/memory?path=/etc/passwd")).statusCode).toBe(400);
    await symlink("/etc", join(f.root, "pending/skills/link"));
    expect((await f.request("GET", "/pending")).json().coverage).toBe("partial");
  });
  it("validiert Pendingmetadaten, Epochmillisekunden und gepinnte destruktive Belege", async () => {
    await writeFile(join(f.root, "pending/memory/1234abcd.json"), JSON.stringify(record("1234abcd")));
    const response = await f.request("GET", "/pending"); expect(response.statusCode).toBe(200); const data = response.json();
    expect(data.records[0]).toMatchObject({ id: "1234abcd", status: "pending", createdAt: 1_700_000_000_000, matchedEntryComplete: true }); expect(data.review).toEqual({ supported: false, adminPath: "/hermes" });
    expect((await f.request("POST", "/pending/1234abcd/approve", {})).statusCode).toBe(404); expect(f.writes).toHaveLength(0);
  });
  it.each([{ id: "deadbeef" }, { subsystem: "skills" }, { action: "arbitrary" }, { origin: "untrusted" }, { created_at: "invalid" }, { payload: { action: "add" } }])("behält beschädigte oder unpassende Records als unknown: %j", async (extra) => {
    await writeFile(join(f.root, "pending/memory/1234abcd.json"), JSON.stringify(record("1234abcd", extra)));
    const data = (await f.request("GET", "/pending")).json(); expect(data.records[0].status).toBe("unknown"); expect(data.records[0].payload.text).toBe(null); expect(data.coverage).toBe("partial");
  });
  it("erkennt Korruption und Pendingdateisymlinks ohne Inhalte zu übernehmen", async () => {
    await writeFile(join(f.root, "pending/memory/1234abcd.json"), "{broken"); await symlink("/etc/passwd", join(f.root, "pending/memory/1234abce.json"));
    const data = (await f.request("GET", "/pending")).json(); expect(data.records).toHaveLength(2); expect(data.records.every((row: { status: string }) => row.status === "unknown")).toBe(true);
  });
  it("markiert gekürztes matched_entry unvollständig und begrenzt den gemeinsamen Roster", async () => {
    const long = record("1234abcd", { payload: { action: "replace", matched_entry: "x".repeat(30_000), credentials: "hidden" } });
    await writeFile(join(f.root, "pending/memory/1234abcd.json"), JSON.stringify(long));
    let data = (await f.request("GET", "/pending")).json(); expect(data.records[0].matchedEntryComplete).toBe(false); expect(data.records[0].payload.truncated).toBe(true); expect(JSON.stringify(data)).not.toContain("hidden");
    await Promise.all(Array.from({ length: 101 }, (_, index) => { const id = index.toString(16).padStart(8, "0"); return writeFile(join(f.root, `pending/skills/${id}.json`), JSON.stringify(record(id, { subsystem: "skills", action: "create", payload: { action: "create" } }))); }));
    data = (await f.request("GET", "/pending")).json(); expect(data.records).toHaveLength(100); expect(data.truncated).toBe(true); expect(data.coverage).toBe("partial");
  });
  it("maskiert gelabelte Tokens, Basic/Bearer und bekannte überlappende Langwerte vor Kürzung", async () => {
    const secret = "LONG-" + "z".repeat(80_000); f.pool.resources!.secrets.remember(secret.slice(0, 20)); f.pool.resources!.secrets.remember(secret);
    await writeFile(join(f.root, "memories/MEMORY.md"), `token=labelsecret Authorization: Bearer bearerValue Basic cHJpdmF0ZQ==\n${secret}`);
    const data = (await f.request("GET", "/memory")).json(); const text = data.files[0].text;
    for (const value of ["labelsecret", "bearerValue", "cHJpdmF0ZQ==", "LONG-", "z".repeat(10)]) expect(text).not.toContain(value);
    expect(text).toContain("***");
  });
  it("verwirft Profilwechsel ohne irgendeine aktive Chatlease", async () => {
    await mkdir(join(f.root, "other")); f.hook((method, path) => { if (method === "GET" && path.startsWith("/api/memory?")) { f.profile("other"); return { active: "old-private-value", providers: [] }; } });
    const result = await f.request("GET", "/memory"); expect(result.statusCode).not.toBe(200); expect(result.body).not.toContain("old-private-value"); expect(f.pool.existing()).toHaveLength(0);
  });
  it("deklariert fehlenden nativen Providerroster als unvollständig", async () => {
    f.hook((_method, path) => path.startsWith("/api/memory?") ? { active: "builtin" } : undefined);
    const result = await f.request("GET", "/memory"); expect(result.statusCode).toBe(200); expect(result.json().truncated).toBe(true); expect(result.json().providers).toEqual([]);
  });
});
