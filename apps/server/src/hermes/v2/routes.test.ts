import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hermesV2ServerMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { FakeGateway } from "./fake-gateway.fixture.js";
import { registerHermesV2Routes } from "./routes.js";
import { GatewayPool } from "./pool.js";

describe("Hermes V2 Domain-WebSocket", () => {
  let root: string;
  let gateway: FakeGateway;
  let app: FastifyInstance;
  let origin: string;
  let pool: GatewayPool;
  const browsers: WebSocket[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hermes-v2-routes-"));
    gateway = new FakeGateway(root);
    const deps = gateway.dependencies(await gateway.start());
    deps.identity = { allowedUsers: ["ben"] };
    deps.policy = { ...deps.policy, browserBytes: 1_024 };
    pool = new GatewayPool(deps);
    app = Fastify({ logger: false });
    await app.register(websocket);
    await app.register(registerHermesV2Routes, { ...deps, pool, prefix: "/api/v1" });
    origin = await app.listen({ host: "127.0.0.1", port: 0 });
  });
  afterEach(async () => {
    for (const browser of browsers.splice(0)) browser.terminate();
    await app.close();
    await gateway.close();
    await rm(root, { recursive: true, force: true });
  });

  async function browser(query = "") {
    const socket = new WebSocket(`${origin.replace("http", "ws")}/api/v1/hermes/v2/gateway${query}`, { headers: { origin, "tailscale-user-login": "ben" } });
    browsers.push(socket);
    const messages: HermesV2ServerMessage[] = [];
    socket.on("message", (data) => messages.push(hermesV2ServerMessageSchema.parse(JSON.parse(data.toString()))));
    await once(socket, "open");
    return { socket, messages };
  }

  it("projiziert die tatsächliche Connection-ID ausschließlich mit composer=1 und hält Query strikt", async () => {
    for (const query of ["?composer=0", "?composer=true", "?composer=1&profile=other"])
      expect((await app.inject({ url: `/api/v1/hermes/v2/gateway${query}`, headers: { origin, "tailscale-user-login": "ben" } })).statusCode).toBe(403);
    const modern = await browser("?composer=1&readEvidence=1"); const legacy = await browser();
    await expect.poll(() => modern.messages.some((frame) => frame.type === "connection" && frame.connectionId !== undefined)).toBe(true);
    const frame = modern.messages.find((entry) => entry.type === "connection");
    expect(frame?.type === "connection" && frame.connectionId).toMatch(/^[a-f0-9-]{36}$/);
    expect(legacy.messages.every((entry) => entry.type !== "connection" || !Object.hasOwn(entry, "connectionId"))).toBe(true);
  });

  it("prüft Identität und Origin vor Upgrade ohne Hermes-Verbindung", async () => {
    for (const headers of [{ origin }, { origin, "tailscale-user-login": "fremd" }, { origin: "https://fremd.invalid", "tailscale-user-login": "ben" }, { "tailscale-user-login": "ben" }]) {
      const response = await app.inject({ url: "/api/v1/hermes/v2/gateway", headers });
      expect(response.statusCode).toBe(403);
    }
    expect(gateway.connections).toBe(0);
  });

  it("weist Raw-RPC, freie Profile/Pfade/Config und unbekannte Felder zurück", async () => {
    const { socket, messages } = await browser();
    for (const value of [
      { jsonrpc: "2.0", id: 1, method: "shell.exec", params: { command: "echo verboten" } },
      { v: 1, id: randomUUID(), op: "session.create", projectId: null, cwd: "/etc" },
      { v: 1, id: randomUUID(), op: "session.create", projectId: null, profile: "fremd" },
      { v: 1, id: randomUUID(), op: "config.set", key: "yolo", value: true },
    ]) socket.send(JSON.stringify(value));
    await expect.poll(() => messages.filter((entry) => entry.type === "error").length).toBe(4);
    expect(gateway.calls.every((call) => ["client.capabilities", "gateway.ping"].includes(call.method))).toBe(true);
    expect(gateway.sessions.size).toBe(0);
  });

  it("verarbeitet malformed JSON ohne Payload-Echo und schließt Oversize", async () => {
    const { socket, messages } = await browser();
    socket.send('{"secret":"dummy-malformed-value"');
    await expect.poll(() => messages.some((entry) => entry.type === "error")).toBe(true);
    expect(JSON.stringify(messages)).not.toContain("dummy-malformed-value");
    const closed = once(socket, "close");
    socket.send("x".repeat(1_025));
    expect((await closed)[0]).toBe(1009);
    expect(gateway.calls.every((call) => ["client.capabilities", "gateway.ping"].includes(call.method))).toBe(true);
    expect(gateway.sessions.size).toBe(0);
  });

  it("verhindert doppelte Operations-ID und greift nicht auf unabonnierten Chat zu", async () => {
    const { socket, messages } = await browser();
    const id = randomUUID();
    const create = { v: 1, id, op: "session.create", projectId: null };
    socket.send(JSON.stringify(create));
    await expect.poll(() => messages.some((entry) => entry.type === "result" && entry.id === id)).toBe(true);
    socket.send(JSON.stringify(create));
    socket.send(JSON.stringify({ v: 1, id: randomUUID(), op: "message.submit", sessionId: "nicht-abonniert", text: "Hallo" }));
    await expect.poll(() => messages.filter((entry) => entry.type === "error").length).toBe(2);
    expect(gateway.calls.filter((entry) => entry.method === "session.create")).toHaveLength(1);
    expect(gateway.calls.some((entry) => entry.method === "prompt.submit")).toBe(false);
    expect(JSON.stringify(messages)).not.toContain(gateway.token);
  });

  it("nimmt injectierten Pool für Metadaten-Fanout und räumt ihn bei Fastify-Close auf", async () => {
    const { socket, messages } = await browser();
    socket.send(JSON.stringify({ v: 1, id: randomUUID(), op: "sessions.list" }));
    await expect.poll(() => gateway.connections).toBe(1);
    pool.publishMetadataInvalidation("ben", "stored-meta", 7);
    await expect.poll(() => messages.some((entry) => entry.type === "event" && entry.event.type === "metadata.invalidated")).toBe(true);
    socket.terminate();
    await app.close();
    await expect.poll(() => gateway.server.clients.size).toBe(0);
  });
});
