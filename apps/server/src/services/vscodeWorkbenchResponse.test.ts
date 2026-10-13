import { Readable } from "node:stream";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/settings.js", () => ({ settings: { vscodeWebDataDirectory: "/tmp/test-vscode", editorHtmlMaxBytes: 64 } }));
vi.mock("./vscodeWorkbench.js", () => ({ createVSCodeWorkbenchConfigurator: () => async (html: string) => html.replace("native", "configured") }));
const { sendVSCodeWorkbenchResponse } = await import("./vscodeWorkbenchResponse.js");
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function response(stream: Readable, type = "text/html", encoding?: string) {
  const app = Fastify();
  apps.push(app);
  app.get("/", async (_request, reply) => {
    const headers = { "content-type": type, "content-security-policy": "script-src 'nonce-native'; frame-ancestors 'self'", "set-cookie": ["session=fixture; HttpOnly"], etag: '"native"', "last-modified": "Mon, 12 Oct 2026 12:00:00 GMT", ...(encoding ? { "content-encoding": encoding } : {}) };
    reply.headers(headers);
    return sendVSCodeWorkbenchResponse(reply, { headers, stream });
  });
  return app.inject("/");
}

describe("VS-Code-Startdokument über HTTP", () => {
  it("sendet die geänderten Bytes mit neuer Länge und erhält CSP sowie Cookies", async () => {
    const result = await response(Readable.from(["<html>native</html>"]));
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("<html>configured</html>");
    expect(Number(result.headers["content-length"])).toBe(Buffer.byteLength(result.body));
    expect(result.headers["content-security-policy"]).toContain("nonce-native");
    expect(result.headers["set-cookie"]).toEqual(["session=fixture; HttpOnly"]);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.headers.etag).toBeUndefined();
    expect(result.headers["last-modified"]).toBeUndefined();
  });

  it("lässt Callback-HTML ohne Konfiguration und seine Cache-Header unverändert", async () => {
    const result = await response(Readable.from(["<html>callback</html>"]));
    expect(result.body).toBe("<html>callback</html>");
    expect(result.headers.etag).toBe('"native"');
  });

  it.each(["application/octet-stream", "text/html"])("überträgt komprimierte %s als Originalbytes", async (type) => {
    const bytes = Buffer.from([31, 139, 8, 0, 255, 128]);
    const result = await response(Readable.from([bytes]), type, "gzip");
    expect(result.rawPayload).toEqual(bytes);
    expect(result.headers["content-encoding"]).toBe("gzip");
  });

  it("bricht ein zu großes Startdokument vor der Konfiguration mit 502 ab", async () => {
    const result = await response(Readable.from(["x".repeat(32), "x".repeat(33)]));
    expect(result.statusCode).toBe(502);
    expect(result.body).toContain("zu groß");
    expect(result.headers.etag).toBeUndefined();
  });

  it("antwortet bei einem abgebrochenen Upstream-Stream mit 502", async () => {
    const stream = new Readable({ read() { this.destroy(new Error("fixture interrupted")); } });
    const result = await response(stream);
    expect(result.statusCode).toBe(502);
    expect(result.body).toContain("nicht geladen");
  });
});
