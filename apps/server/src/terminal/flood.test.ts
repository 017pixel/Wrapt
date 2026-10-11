import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalManager } from "./Manager.js";
import { TERMINAL_FLOOD_MAX_MESSAGES } from "./protocol.js";
import { registerTerminalRoutes } from "./routes.js";

const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("Terminal-Flood-Schutz (S-009)", () => {
  it("schließt den Socket mit 1013 bei Nachrichtenflut", async () => {
    const app = Fastify();
    apps.push(app);
    const manager = new TerminalManager({ allowedRoots: ["/tmp"], defaultCwd: "/tmp", maxSessions: 1 });
    await app.register(websocket, { options: { maxPayload: 65_536 } });
    await app.register(registerTerminalRoutes, {
      prefix: "/api/v1",
      manager,
      allowedUsers: ["terminal-test@example.com"],
    });
    await app.ready();

    const socket = await app.injectWS("/api/v1/terminal", {
      headers: { "tailscale-user-login": "terminal-test@example.com", origin: "http://localhost", host: "localhost", "x-forwarded-proto": "http" },
    });
    const closed = new Promise<{ code: number }>((resolve) => {
      socket.on("close", (code: number) => resolve({ code }));
    });
    for (let index = 0; index < TERMINAL_FLOOD_MAX_MESSAGES + 10; index += 1) {
      socket.send(JSON.stringify({ type: "terminal.ping" }));
    }
    const result = await Promise.race([
      closed,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Socket wurde nicht geschlossen.")), 5_000)),
    ]);
    expect(result.code).toBe(1013);
    socket.terminate();
    manager.shutdown();
  }, 15_000);

  it("beantwortet einzelne Pings normal", async () => {
    const app = Fastify();
    apps.push(app);
    const manager = new TerminalManager({ allowedRoots: ["/tmp"], defaultCwd: "/tmp", maxSessions: 1 });
    await app.register(websocket, { options: { maxPayload: 65_536 } });
    await app.register(registerTerminalRoutes, {
      prefix: "/api/v1",
      manager,
      allowedUsers: ["terminal-test@example.com"],
    });
    await app.ready();

    const socket = await app.injectWS("/api/v1/terminal", {
      headers: { "tailscale-user-login": "terminal-test@example.com", origin: "http://localhost", host: "localhost", "x-forwarded-proto": "http" },
    });
    const pong = new Promise<string>((resolve) => {
      socket.once("message", (data: Buffer) => resolve(data.toString()));
    });
    socket.send(JSON.stringify({ type: "terminal.ping" }));
    expect(JSON.parse(await pong)).toEqual({ type: "terminal.pong" });
    socket.terminate();
    manager.shutdown();
  });
});
