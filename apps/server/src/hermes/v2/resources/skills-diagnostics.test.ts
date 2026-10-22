import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";

describe("Native Skills und passive V2-Diagnose", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); }); afterEach(async () => { await f.close(); });
  it("liest Herkunft und Skilltext exakt readonly und verlinkt bestehenden Editor", async () => {
    const list = await f.request("GET", "/skills"); expect(list.statusCode).toBe(200); expect(list.json()).toMatchObject({ editorPath: "/ki-skills", skills: [{ name: "test-skill", provenance: "bundled", readOnly: true, usage: 2 }] });
    const detail = await f.request("GET", "/skills/detail?name=test-skill"); expect(detail.statusCode).toBe(200); expect(detail.json().content.text).toBe("# Test"); expect(detail.body).not.toContain("/private/ignored");
    expect(f.writes).toHaveLength(0); expect(f.pool.existing()).toHaveLength(0);
  });
  it("leitet keinen unbekannten Skillnamen oder Pfad an den nativen Contentreader weiter", async () => {
    expect((await f.request("GET", "/skills/detail?name=../../etc/passwd")).statusCode).toBe(404);
    expect(f.paths.some((path) => path.startsWith("/api/skills/content"))).toBe(false);
    expect((await f.request("GET", "/skills/detail?name=test-skill&path=/etc/passwd")).statusCode).toBe(400);
  });
  it("verwirft eine falsche Contentquittung und hält Toggle-/Installtunnel geschlossen", async () => {
    f.hook((method, path) => method === "GET" && path.startsWith("/api/skills/content") ? { name: "different", content: "privat" } : undefined);
    const result = await f.request("GET", "/skills/detail?name=test-skill"); expect(result.statusCode).toBe(503); expect(result.body).not.toContain("privat");
    expect((await f.request("POST", "/skills/toggle", { name: "test-skill" })).statusCode).toBe(404);
  });
  it("nutzt Slashzuordnung nur aus tatsächlichem Katalog der vorhandenen Verbindung", async () => {
    const browser = f.browser(); await browser.manager.upstream.connect(); expect(browser.manager.upstream.state).toBe("online");
    const prior = f.core.resultHook; f.core.resultHook = (method, params, value) => method === "commands.catalog" ? { pairs: [["/test-skill", "Test"]], skills: { "/test-skill": {} } } : prior?.(method, params, value) ?? value;
    const result = await f.request("GET", "/skills"); expect(result.json().skills[0].slashCommand).toBe("/test-skill");
    expect(f.core.calls.find((call) => call.method === "commands.catalog")?.params).toEqual({ profile: "default" });
  });
  it("zeigt tatsächliche Verbindung oder unavailable und führt keine CLI-/Dienstprüfung aus", async () => {
    const result = await f.request("GET", "/diagnostics"); expect(result.statusCode).toBe(200); expect(result.json()).toMatchObject({ connection: { state: "unavailable", subscriptions: 0, protectedRuntime: false }, dashboard: { reachable: true, version: "1.0", gatewayState: "running" }, adminPath: "/hermes" });
    const paths = f.paths.filter((path) => !path.startsWith("/api/profiles")); expect(paths).toEqual(["/api/status?profile=default", "/api/logs?file=agent&lines=50&profile=default"]); expect(f.writes).toHaveLength(0); expect(f.core.calls).toHaveLength(0);
  });
  it("maskiert und begrenzt echte Logtails sowie Credentialobjekte ohne fremde Textfelder", async () => {
    f.pool.resources!.secrets.remember("secret-overlap");
    f.hook((_method, path) => path.startsWith("/api/logs?") ? { lines: ["Authorization: Bearer abcdefgh", "Basic c2VjcmV0", "token=private", "secret-overlap", "x".repeat(20_000)] } : undefined);
    const result = await f.request("GET", "/diagnostics"); expect(result.statusCode).toBe(200); expect(result.json().logs.truncated).toBe(true); expect(result.json().truncated).toBe(true);
    for (const secret of ["abcdefgh", "c2VjcmV0", "private", "secret-overlap"]) expect(result.body).not.toContain(secret);
    expect(Buffer.byteLength(result.json().logs.text)).toBeLessThanOrEqual(16_384);
  });
});
