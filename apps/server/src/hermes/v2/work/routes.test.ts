import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { hermesV2ServerMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workFixture } from "./test.fixture.js";

describe("Echtes Workquery-Optin am privaten Fake-Loopback", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  const sockets: WebSocket[] = [];
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      if (socket.readyState === WebSocket.CLOSED) continue;
      const closed = once(socket, "close"); socket.close(); await closed;
    }
    await f.close();
  });
  it.each([false, true])("work=%s wird vom tatsächlichen Gateway ausgewertet und projiziert", async (enabled) => {
    const address = await f.app.listen({ host: "127.0.0.1", port: 0 });
    const messages: HermesV2ServerMessage[] = [];
    const socket = new WebSocket(address.replace("http:", "ws:") + `/api/v1/hermes/v2/gateway${enabled ? "?work=1" : ""}`,
      { headers: { host: "workbench.test", origin: "http://workbench.test", "tailscale-user-login": "a" } });
    sockets.push(socket);
    socket.on("message", (raw) => messages.push(hermesV2ServerMessageSchema.parse(JSON.parse(raw.toString()))));
    await once(socket, "open");
    const subscribe = randomUUID();
    socket.send(JSON.stringify({ v: 1, id: subscribe, op: "session.subscribe", sessionId: f.session.id }));
    await expect.poll(() => messages.some((frame) => frame.type === "result" && frame.id === subscribe)).toBe(true);
    const read = randomUUID(); socket.send(JSON.stringify({ v: 1, id: read, op: "work.read", sessionId: f.session.id }));
    await expect.poll(() => messages.some((frame) => (frame.type === "result" || frame.type === "error") && frame.id === read)).toBe(true);
    expect(messages.find((frame) => (frame.type === "result" || frame.type === "error") && frame.id === read)?.type).toBe(enabled ? "result" : "error");
    f.event("subagent.start", { subagent_id: "kind", goal: "Belegtes Ziel" });
    await expect.poll(() => messages.some((frame) => frame.type === "event" && frame.event.type === "subagent.updated")).toBe(true);
    expect(messages.some((frame) => frame.type === "event" && frame.event.type === "work.updated")).toBe(enabled);
  });
});
