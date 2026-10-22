import fs from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretRedactor } from "../secret-redactor.js";
import { resourceText } from "./projection.js";
import { resourceFixture } from "./resource.fixture.js";

describe("Rohstruktur und dynamische Ressourcenmaskierung", () => {
  it.each(["cred", "entials", "credential", "pass", "word"])("erkennt sensible Rohschlüssel trotz Teilsecret %s", (secret) => {
    const redactor = new SecretRedactor(); redactor.remember(secret);
    const raw = '{"credentials":{"nested":["UNBEKANNTER_WERT",42]},"password":"FREMDER_WERT","safe":"sichtbar"}';
    const output = resourceText(redactor, raw).text;
    expect(output).not.toContain("UNBEKANNTER_WERT"); expect(output).not.toContain("FREMDER_WERT");
    expect(output).toContain("sichtbar"); expect(raw).toContain("UNBEKANNTER_WERT");
    expect(JSON.parse(output)).toBeTypeOf("object");
  });
  it.each(['"FREMDER_WERT"', '{"x":"FREMDER_WERT"}', '["FREMDER_WERT",{"x":1}]', "123456789", "true"])("maskiert den gesamten sensiblen JSONwert %s", (value) => {
    const redactor = new SecretRedactor(); redactor.remember("cred");
    const output = resourceText(redactor, `{"credent\\u0069als":${value},"safe":"erhalten"}`).text;
    expect(output).not.toContain(value); expect(output).toContain("erhalten"); expect(JSON.parse(output)).toBeTypeOf("object");
  });
  it.each([false, true])("vereinigt Rawintervalle, überlappende Vollwerte und gekürzte Langpräfixe, umgekehrt=%s", (reverse) => {
    const redactor = new SecretRedactor();
    const raw = '{"credentials":"UNBEKANNT","safe":"ä😀' + "z".repeat(80_000);
    const long = raw + '-ENDE"}';
    for (const secret of reverse ? [long, "cred"] : ["cred", long]) redactor.remember(secret);
    expect(resourceText(redactor, raw, 100, true)).toEqual({ text: "***", truncated: false });
  });
  it("schützt einen unvollständig gelesenen sensiblen Wert vor der Bytekürzung", () => {
    const redactor = new SecretRedactor(); redactor.remember("word");
    const output = resourceText(redactor, '{"password":"FREMDER_WERT' + "😀".repeat(30_000), 32, true);
    expect(output.text).not.toContain("FREMDER_WERT"); expect(Buffer.byteLength(output.text)).toBeLessThanOrEqual(32);
    expect(output.text).not.toContain("\uFFFD");
  });
  it.each([
    ["password=UNBEKANNTER_WERT", "pass"], ["password=UNBEKANNTER_WERT", "word"],
    ["api_key=UNBEKANNTER_WERT", "api"], ["api_key=UNBEKANNTER_WERT", "key"],
    ["Bearer UNBEKANNTER_WERT", "Bear"], ["Basic UNBEKANNTER_WERT", "sic"],
    ["https://example.test/?token=UNBEKANNTER_WERT&safe=erhalten", "ken"],
    ["ghp_UNBEKANNTER_WERT_LONG", "ghp"],
  ])("bewahrt die ursprüngliche statische Textklassifikation: %s", (raw, secret) => {
    const redactor = new SecretRedactor(); redactor.remember(secret);
    const output = resourceText(redactor, raw, 65_536, true).text;
    expect(output).not.toContain("UNBEKANNTER_WERT"); expect(output).toContain("***");
  });
});

const lstat = fs.lstat;
describe("HTTP-Ressourcen mit tatsächlich beantwortetem Secret", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); });
  afterEach(async () => { fs.lstat = lstat; syncBuiltinESMExports(); await f.close(); });
  async function secretChat() {
    const browser = f.browser(); const session = f.core.seed("credential-secret-chat");
    f.stored.set(session.id, { id: session.id, profile: "default", cwd: f.root, title: "Test" });
    await browser.manager.handle(browser.id, { v: 1, id: randomUUID(), op: "session.subscribe", sessionId: session.id });
    const record = browser.manager.sessions.records.get(session.id)!;
    return async (value: string) => {
      const id = `srq-${randomUUID()}`; f.core.request(session, "secret", { label: "Test" }, id);
      await expect.poll(() => record.snapshot.requests.some((row) => row.kind === "secret")).toBe(true);
      const request = record.snapshot.requests.find((row) => row.kind === "secret")!;
      await browser.manager.handle(browser.id, { v: 1, id: randomUUID(), op: "request.respond", sessionId: session.id,
        epoch: request.epoch, requestKey: request.key, response: { kind: "secret", value } });
      await expect.poll(() => f.core.responses.some((row) => row.id === id)).toBe(true);
    };
  }
  async function prepare() {
    await fs.writeFile(join(f.root, "memories/MEMORY.md"), '{"credentials":"UNBEKANNTER_WERT","safe":"erhalten"}');
    await fs.writeFile(join(f.root, "pending/memory/1234abcd.json"), JSON.stringify({ id: "1234abcd", subsystem: "memory", action: "add", summary: "Test", origin: "foreground",
      created_at: 1_700_000_000, payload: { action: "add", password: "UNBEKANNTER_WERT", safe: "erhalten" } }));
  }
  for (const path of ["/memory", "/pending"]) for (const value of ["cred", "entials", "credential", "pass", "word"]) it(`maskiert ${path} nach echter Antwort ${value}`, async () => {
    const learn = await secretChat(); await learn(value); await prepare();
    const response = await f.request("GET", path); expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("UNBEKANNTER_WERT"); expect(response.body).toContain("erhalten");
    if (path === "/pending") expect(response.json().records[0].id).toBe("1234abcd");
  });
  it.each([["password", "pass"], ["password", "word"], ["api_key", "api"], ["api_key", "key"]])("maskiert Plaintext %s nach echter Teilantwort %s", async (key, secret) => {
    const learn = await secretChat(); await learn(secret);
    await fs.writeFile(join(f.root, "memories/MEMORY.md"), `${key}=UNBEKANNTER_WERT\n`);
    const response = await f.request("GET", "/memory"); expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("UNBEKANNTER_WERT"); expect(f.core.responses).toHaveLength(1);
  });
  it.each(["/memory", "/pending"])("prüft sensible Rohstruktur erneut bei spät gelerntem Schlüsselteil für %s", async (path) => {
    const learn = await secretChat(); await prepare(); let armed = false; let held = false; let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; }); const released = new Promise<void>((resolve) => { release = resolve; });
    f.hook((_method, nativePath) => { if (nativePath.startsWith("/api/memory?")) armed = true; });
    // Pending besitzt keinen nativen Read; sein erster HOMEbeleg liegt vor den Dateireads.
    if (path === "/pending") armed = true;
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await lstat(...args);
      if (armed && !held && String(args[0]) === f.root) { held = true; enter(); await released; }
      return stat;
    }) as typeof fs.lstat; syncBuiltinESMExports();
    const response = f.request("GET", path);
    try { await entered; await learn(path === "/pending" ? "word" : "cred"); }
    finally { release(); }
    const result = await response; expect(held).toBe(true); expect(result.statusCode).toBe(200); expect(result.body).not.toContain("UNBEKANNTER_WERT");
  });
});
