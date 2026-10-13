import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { expect, it, vi } from "vitest";
import type { TerminalManager } from "./Manager.js";
import { registerTerminalRoutes } from "./routes.js";

it.each(["create", "restart"] as const)("ordnet Subscribe nach langsamem %s ein und hält andere Runtimes frei", async (action) => {
  const slow = "00000000-0000-4000-8000-000000000011";
  const fast = "00000000-0000-4000-8000-000000000012";
  const calls: string[] = [];
  let release!: () => void;
  const session = (id: string) => ({ id, runtimeId: id, kind: "shell", projectId: null, status: "running", cwd: "/tmp", pid: 1 });
  const mutation = async () => {
    calls.push("start");
    await new Promise<void>((resolve) => { release = resolve; });
    calls.push("fertig");
    return session(slow);
  };
  const manager = {
    createSession: mutation,
    restartSession: mutation,
    resolveRuntime: (_user: string, id: string) => session(id),
    resolveSession: (_user: string, id: string) => session(id),
    attachSession: async (_user: string, id: string) => {
      calls.push(`attach:${id}`);
      return () => {};
    },
    detachClient: vi.fn(),
  } as unknown as TerminalManager;
  const app = Fastify();
  await app.register(websocket);
  await app.register(registerTerminalRoutes, { manager, allowedUsers: ["test@example.com"] });
  await app.ready();
  const socket = await app.injectWS("/terminal", { headers: {
    "tailscale-user-login": "test@example.com", origin: "http://localhost", host: "localhost", "x-forwarded-proto": "http",
  } });
  const replies: unknown[] = [];
  socket.on("message", (data: Buffer) => replies.push(JSON.parse(data.toString())));
  try {
    socket.send(JSON.stringify(action === "create"
      ? { type: "terminal.create", requestId: "geordnet", runtimeId: slow, cols: 80, rows: 24 }
      : { type: "terminal.restart", sessionId: slow }));
    socket.send(JSON.stringify({ type: "terminal.subscribe", runtimeId: slow }));
    socket.send(JSON.stringify({ type: "terminal.subscribe", runtimeId: fast }));
    socket.send(JSON.stringify({ type: "terminal.ping" }));
    await vi.waitFor(() => {
      expect(calls).toContain(`attach:${fast}`);
      expect(replies).toContainEqual({ type: "terminal.pong" });
    });
    expect(calls).not.toContain(`attach:${slow}`);
    release();
    await vi.waitFor(() => expect(calls).toContain(`attach:${slow}`));
    expect(calls.indexOf("fertig")).toBeLessThan(calls.indexOf(`attach:${slow}`));
  } finally { release?.(); socket.terminate(); await app.close(); }
});
