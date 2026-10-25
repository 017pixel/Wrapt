import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { get } from "node:http";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { EditorOpenSecrets, normalizeEditorTarget, registerEditorOpenRoutes } from "./editorOpen.js";

const directories: string[] = [];
const apps: Array<ReturnType<typeof Fastify>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function fixture(listen = false) {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-editor-")); directories.push(directory);
  const secrets = new EditorOpenSecrets(directory);
  const app = Fastify(); apps.push(app);
  await app.register(websocket);
  await app.register(registerEditorOpenRoutes, { prefix: "/api/v1", secrets });
  await app.ready();
  if (!listen) return { app, secrets, directory };
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { app, secrets, directory, port };
}

describe("Open-in-Editor-API", () => {
  it("legt das Capability-Token beim Start an und lehnt beschädigte Dateien ab", async () => {
    const { secrets } = await fixture();
    const token = secrets.token();
    expect(token.length).toBeGreaterThan(32);
    expect(secrets.matchesToken(token)).toBe(true);
    expect(secrets.matchesToken("falsch")).toBe(false);
    expect(() => secrets.matchesToken("")).not.toThrow();

    const brokenDirectory = mkdtempSync(join(tmpdir(), "wrapt-editor-broken-")); directories.push(brokenDirectory);
    writeFileSync(join(brokenDirectory, "editor-open-capability"), "kein-base64-token\n");
    const broken = new EditorOpenSecrets(brokenDirectory);
    expect(() => broken.token()).toThrow(/beschädigt/);
  });

  it("nimmt nur Loopback-Aufrufe mit gültigem Token an und validiert den Pfad", async () => {
    const { app, secrets } = await fixture();
    const token = secrets.token();

    const missing = await app.inject({ method: "POST", url: "/api/v1/editor/open", payload: { path: "/tmp/x" } });
    expect(missing.statusCode).toBe(401);

    const invalidToken = await app.inject({ method: "POST", url: "/api/v1/editor/open", headers: { authorization: "Bearer falsch" }, payload: { path: "/tmp/x" } });
    expect(invalidToken.statusCode).toBe(401);

    const relative = await app.inject({ method: "POST", url: "/api/v1/editor/open", headers: { authorization: `Bearer ${token}` }, payload: { path: "relativ/ordnung" } });
    expect(relative.statusCode).toBe(400);

    const foreign = await app.inject({ method: "POST", url: "/api/v1/editor/open", remoteAddress: "10.0.0.5", headers: { authorization: `Bearer ${token}` }, payload: { path: "/tmp/x" } });
    expect(foreign.statusCode).toBe(403);

    // S-006: Proxy-Header dürfen die Loopback-Prüfung nie beeinflussen — nur
    // die echte Transportschicht (socket.remoteAddress) zählt.
    const spoofed = await app.inject({
      method: "POST",
      url: "/api/v1/editor/open",
      remoteAddress: "10.0.0.5",
      headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "127.0.0.1" },
      payload: { path: "/tmp/x" },
    });
    expect(spoofed.statusCode).toBe(403);
    const loopbackWithForwarded = await app.inject({
      method: "POST",
      url: "/api/v1/editor/open",
      remoteAddress: "127.0.0.1",
      headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "10.0.0.5" },
      payload: { path: "/tmp/x" },
    });
    expect(loopbackWithForwarded.statusCode).toBe(202);

    const accepted = await app.inject({ method: "POST", url: "/api/v1/editor/open", headers: { authorization: `Bearer ${token}` }, payload: { path: "/tmp/x" } });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toEqual({ accepted: true });
  });

  it("normalisiert Dateipfade auf den übergeordneten Ordner und behält Ordnernamen", () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-editor-files-")); directories.push(directory);
    const file = join(directory, "datei.txt");
    writeFileSync(file, "inhalt");
    expect(normalizeEditorTarget(file)).toBe(directory);
    expect(normalizeEditorTarget(directory)).toBe(directory);
    expect(normalizeEditorTarget(join(directory, "nicht-vorhanden"))).toBe(join(directory, "nicht-vorhanden"));
    expect(normalizeEditorTarget(`${directory}/`)).toBe(`${directory}/`);
    expect(normalizeEditorTarget("relativ")).toBe("relativ");
  });

  it("sendet das Event an verbundene WebSocket-Clients", async () => {
    const { app, secrets, port } = await fixture(true);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/editor/ws`, { headers: { origin: `http://127.0.0.1:${port}` } });
    const messages: string[] = [];
    ws.on("message", (data) => messages.push(String(data)));
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messages.some((message) => message.includes("editor.ready"))).toBe(true);

    const response = await app.inject({ method: "POST", url: "/api/v1/editor/open", headers: { authorization: `Bearer ${secrets.token()}` }, payload: { path: "/tmp/x" } });
    expect(response.statusCode).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messages.some((message) => message.includes("editor.open"))).toBe(true);

    ws.close();
  });

  it("erhält Datei und Cursorposition und schützt die Runtime mit Loopback und Token", async () => {
    const { app, secrets, directory } = await fixture();
    const file = join(directory, "datei mit #.ts");
    writeFileSync(file, "test");
    const response = await app.inject({ method: "POST", url: "/api/v1/editor/open", headers: { authorization: `Bearer ${secrets.token()}` }, payload: { path: file, line: 3, column: 5 } });
    expect(response.statusCode).toBe(202);
    for (const path of ["/tmp/x\0", "relativ"]) {
      expect((await app.inject({ method: "POST", url: "/api/v1/editor/open", headers: { authorization: `Bearer ${secrets.token()}` }, payload: { path } })).statusCode).toBe(400);
    }
    expect((await app.inject("/api/v1/editor/runtime?folder=%2Ftmp")).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/v1/editor/runtime?folder=%2Ftmp", remoteAddress: "10.0.0.1", headers: { authorization: `Bearer ${secrets.token()}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/v1/editor/runtime?folder=relativ", headers: { authorization: `Bearer ${secrets.token()}` } })).statusCode).toBe(400);
  });

  it("stellt Dateiziele beim echten HTTP-Verbindungsaufbau zu und meldet deren Abbruch", async () => {
    const { app, secrets, directory, port } = await fixture(true);
    const file = join(directory, "datei.ts");
    writeFileSync(file, "test");
    await app.inject({ method: "POST", url: "/api/v1/editor/open", headers: { authorization: `Bearer ${secrets.token()}` }, payload: { path: file, line: 3, column: 5 } });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/editor/ws`, { headers: { origin: `http://127.0.0.1:${port}` } });
    const messages: string[] = [];
    ws.on("message", (data) => messages.push(String(data)));
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    let request: ReturnType<typeof get> | undefined;
    try {
      const event = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Runtime-Event fehlt")), 2_000);
        request = get(`http://127.0.0.1:${port}/api/v1/editor/runtime?folder=${encodeURIComponent(directory)}`, { headers: { authorization: `Bearer ${secrets.token()}` } }, (response) => {
          let pending = "";
          response.on("data", (data) => {
            pending += String(data);
            const lines = pending.split("\n"); pending = lines.pop()!;
            for (const line of lines) {
              const value = JSON.parse(line);
              if (value.type === "editor.open") { clearTimeout(timer); resolve(value); }
            }
          });
        });
        request.on("error", (error) => { clearTimeout(timer); reject(error); });
      });
      expect(event).toMatchObject({ type: "editor.open", path: directory, file, line: 3, column: 5 });
      expect(messages.some((message) => message.includes('"ready":true'))).toBe(true);
      request!.destroy();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(messages.some((message) => message.includes('"ready":false'))).toBe(true);
    } finally { request?.destroy(); ws.close(); }
  });
});
