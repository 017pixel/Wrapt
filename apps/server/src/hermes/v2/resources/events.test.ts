import { once } from "node:events";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hermesV2ServerMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { resourceFixture } from "./resource.fixture.js";

describe("Globale Ressourceninvalidierung über bestehenden V2-Socket", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>; const sockets: WebSocket[] = [];
  beforeEach(async () => { f = await resourceFixture(); });
  afterEach(async () => { for (const socket of sockets.splice(0)) socket.terminate(); await f.close(); });
  it("leitet cron.changed nur an resources=1 weiter, ohne Chatlease, RPC oder zweite Coreverbindung", async () => {
    const origin = await f.app.listen({ host: "127.0.0.1", port: 0 });
    const browser = async (query: string) => {
      const socket = new WebSocket(`${origin.replace("http", "ws")}/api/v1/hermes/v2/gateway${query}`, { headers: { origin, "tailscale-user-login": "a" } }); sockets.push(socket);
      const frames: HermesV2ServerMessage[] = []; socket.on("message", (raw) => frames.push(hermesV2ServerMessageSchema.parse(JSON.parse(raw.toString()))));
      await once(socket, "open"); return frames;
    };
    const modern = await browser("?resources=1"); const legacy = await browser("");
    await f.pool.peek("a")!.upstream.connect(); const before = f.core.calls.length;
    for (const socket of f.core.viewers.keys()) socket.send(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { type: "cron.changed", session_id: "", payload: { ignored: "no config dump" } } }));
    await expect.poll(() => modern.some((frame) => frame.type === "event" && frame.event.type === "resources.invalidated")).toBe(true);
    expect(legacy.some((frame) => frame.type === "event" && frame.event.type === "resources.invalidated")).toBe(false);
    expect(f.core.connections).toBe(1); expect(f.core.calls.length).toBe(before); expect(f.pool.peek("a")!.sessions.records.size).toBe(0);
    expect(JSON.stringify(modern)).not.toContain("no config dump");
    for (const query of ["resources=0", "resources=true", "resources=1&profile=all"])
      expect((await f.app.inject({ url: `/api/v1/hermes/v2/gateway?${query}`, headers: { origin, "tailscale-user-login": "a" } })).statusCode).toBe(403);
  });
});
