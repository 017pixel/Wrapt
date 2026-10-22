import { afterEach, describe, expect, it } from "vitest";
import type { HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { streamFixture, type StreamFixture } from "./stream-test.fixture.js";
import { clientMessage as message } from "./security-test.fixture.js";

describe("Rawstream-Lebensdauer und bestehende Buffergrenzen", () => {
  let f: StreamFixture;
  afterEach(async () => { await f.close(); });
  const secret = "LIFECYCLE_PREFIX_" + "q7".repeat(1000);
  async function known(policy = {}) { f = await streamFixture(policy); await f.learn(secret); await f.event("message.start"); f.messages.length = 0; }
  it("trennt Text und Reasoning und entfernt den vollständigen Tail nach dem Folgetreffer", async () => {
    await known();
    await f.event("message.delta", { text: "x".repeat(199_900) + secret.slice(0, 500) });
    await f.event("reasoning.delta", { text: secret.slice(0, 700) }); expect(f.buffer.tails.size).toBe(2);
    expect([...f.buffer.tails.values()].map((tail) => tail.length).sort()).toEqual([500, 700]);
    await f.event("message.delta", { text: secret.slice(500) + " PUBLIC-END!" });
    await f.event("reasoning.delta", { text: secret.slice(700) + " PUBLIC-END!" });
    for (const kind of ["message.delta", "reasoning.delta"] as const) {
      const output = f.frames(kind).map((frame) => frame.payload.text).join("");
      expect(output).not.toContain(secret.slice(700, 1200)); expect(output).toContain("PUBLIC-END!");
    }
    expect(f.buffer.tails.size).toBe(0);
  });
  it("hält zwei Browserverbindungen getrennt und räumt beim Unmount nur deren Tail auf", async () => {
    await known(); const other: HermesV2ServerMessage[] = [];
    f.manager.add({ id: "other-tab", send: (frame) => other.push(frame) });
    await f.manager.handle("other-tab", message({ op: "session.subscribe", sessionId: f.session.id }));
    await f.event("message.delta", { text: secret.slice(0, 500) }); expect(f.buffer.tails.size).toBe(2);
    const count = f.frames("message.delta").length; f.manager.release("tab", "navigation"); expect(f.buffer.tails.size).toBe(1);
    f.gateway.event(f.session, "message.delta", { text: secret.slice(500) + " PUBLIC-END!" });
    await expect.poll(() => f.frames("message.delta", other).length).toBe(2);
    expect(f.frames("message.delta")).toHaveLength(count);
    expect(f.frames("message.delta", other).map((frame) => frame.payload.text).join("")).toBe("*** PUBLIC-END!");
    expect(f.buffer.tails.size).toBe(0);
  });
  it("erhält den Tail eines anderen Principals beim Release desselben Connectionnamens", async () => {
    await known(); const manager = f.pool.get("other-principal"); const messages: HermesV2ServerMessage[] = [];
    manager.add({ id: "tab", send: (frame) => messages.push(frame) });
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: f.session.id }));
    await f.event("message.delta", { text: secret.slice(0, 500) }); expect(f.buffer.tails.size).toBe(2);
    f.manager.release("tab", "navigation"); expect(f.buffer.tails.size).toBe(1);
    f.gateway.event(f.session, "message.delta", { text: secret.slice(500) + " PUBLIC-END!" });
    await expect.poll(() => f.frames("message.delta", messages).length).toBe(2);
    expect(f.frames("message.delta", messages).map((frame) => frame.payload.text).join("")).toBe("*** PUBLIC-END!");
  });
  it("räumt nur die exakte Sitzungskennung auf und erhält längere IDs mit Trennzeichen", async () => {
    await known(); const child = f.gateway.seed(`${f.session.id}:child`);
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: child.id }));
    await f.event("message.delta", { text: secret.slice(0, 500) });
    f.gateway.event(child, "message.delta", { text: secret.slice(0, 500) });
    await expect.poll(() => f.buffer.tails.size).toBe(2);
    await f.manager.handle("tab", message({ op: "session.unsubscribe", sessionId: f.session.id })); expect(f.buffer.tails.size).toBe(1);
    f.gateway.event(child, "message.delta", { text: secret.slice(500) + " PUBLIC-END!" });
    await expect.poll(() => f.messages.filter((frame) => frame.type === "event" && frame.event.type === "message.delta" && frame.event.sessionId === child.id).length).toBe(2);
    const output = f.messages.flatMap((frame) => frame.type === "event" && frame.event.type === "message.delta" && frame.event.sessionId === child.id ? [frame.event.payload.text] : []).join("");
    expect(output).toBe("*** PUBLIC-END!"); expect(f.buffer.tails.size).toBe(0);
  });
  it.each(["start", "complete", "unsubscribe", "dispose"])("beendet alte Channeltails an der Grenze %s", async (boundary) => {
    await known(); await f.event("message.delta", { text: secret.slice(0, 500) }); expect(f.buffer.tails.size).toBe(1);
    if (boundary === "start") await f.event("message.start");
    if (boundary === "complete") await f.event("message.complete", { text: "PUBLIC-END!", status: "completed" });
    if (boundary === "unsubscribe") {
      const lease = f.manager.subscriptions.get("tab", f.session.id);
      await f.manager.handle("tab", message({ op: "session.unsubscribe", sessionId: f.session.id }));
      expect(f.buffer.tails.size).toBe(0);
      await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: f.session.id }));
      expect(f.manager.subscriptions.get("tab", f.session.id)).not.toBe(lease);
    }
    if (boundary === "dispose") f.manager.dispose();
    expect(f.buffer.tails.size).toBe(0);
    if (boundary !== "dispose") { await f.event("message.delta", { text: "PUBLIC-END!" }); expect(f.frames("message.delta").at(-1)?.payload.text).toBe("PUBLIC-END!"); }
  });
  it.each([false, true])("beendet Tails bei echtem Transportreconnect, neuer Epoch=%s", async (epochChanged) => {
    await known(); await f.event("message.delta", { text: secret.slice(0, 500) }); const transport = f.manager.upstream.transportId;
    f.gateway.disconnect(epochChanged ? "epoch-2" : undefined);
    await expect.poll(() => f.manager.upstream.state === "online" && f.manager.upstream.transportId !== transport && !f.record.hydrating).toBe(true);
    expect(f.buffer.tails.size).toBe(0); expect(f.record.epoch).toBe(epochChanged ? "epoch-2" : "epoch-1");
    await f.event("message.start"); await f.event("message.delta", { text: secret + " PUBLIC-END!" });
    expect(f.frames("message.delta").at(-1)?.payload.text).toBe("*** PUBLIC-END!");
  });
  it("flushes echte große gepufferte Rawchunks nach Hydrierung und spielt sie beim Wiederlesen nicht erneut aus", async () => {
    await known(); const hook = f.gateway.resultHook; let since = 0; let buffered = false;
    const chunks = ["x".repeat(199_900) + secret.slice(0, 500), secret.slice(500) + " PUBLIC-END!"];
    f.gateway.resultHook = (method, params, result) => {
      if (method === "session.events.since" && ++since === 3) {
        buffered = f.record.hydrating; for (const text of chunks) f.gateway.event(f.session, "message.delta", { text });
      }
      return hook ? hook(method, params, result) : result;
    };
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: f.session.id }));
    expect(buffered).toBe(true); expect(f.frames("message.delta")).toHaveLength(2);
    const output = f.frames("message.delta").map((frame) => frame.payload.text).join("");
    expect(output).toContain("PUBLIC-END!"); expect(output).not.toContain(secret.slice(500, 1000));
    expect(f.record.buffered).toHaveLength(0); expect(f.record.bufferedBytes).toBe(0);
    expect(f.session.events.slice(-2).map((event) => (event.payload as { text: string }).text)).toEqual(chunks);
    f.gateway.resultHook = hook;
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: f.session.id }));
    expect(f.frames("message.delta")).toHaveLength(2);
  });
  it.each(["bytes", "channels"])("behält konservative Unterdrückung beim bestehenden %s-Limit", async (limit) => {
    await known(limit === "bytes" ? { secretBufferBytes: 499 } : { secretStreams: 1 });
    await f.event("message.delta", { text: "x".repeat(199_900) + secret.slice(0, 500) });
    if (limit === "channels") await f.event("reasoning.delta", { text: secret.slice(0, 500) });
    await f.event("message.delta", { text: secret.slice(500) + " PUBLIC-END!" });
    expect(f.buffer.streamSuppressed).toBe(true); expect(f.buffer.tails.size).toBe(0);
    expect(f.frames("message.delta").map((frame) => frame.payload.text).join("")).not.toContain(secret.slice(500, 1000));
  });
});
