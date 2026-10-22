// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayClient } from "./gateway-client";
import { chatPolicy } from "./chat-policy";
import { settle, TestGateway } from "./chat-test-fixtures";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";

describe("öffentlicher Gateway-Client", () => {
  const clients: GatewayClient[] = [];
  function setup() {
    const gateway = new TestGateway();
    const client = gateway.createClient();
    clients.push(client);
    return { gateway, client };
  }
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { for (const client of clients.splice(0)) client.dispose(); vi.useRealTimers(); });
  it("öffnet bei Konstruktion nichts, verbindet same-origin und hat keine Identität im URL", async () => {
    const { gateway, client } = setup();
    expect(gateway.sockets).toHaveLength(0);
    client.start();
    await settle();
    expect(gateway.socket.url).toBe("wss://workbench.test/api/v1/hermes/v2/gateway");
    await expect(client.request({ op: "sessions.list", limit: 100 })).resolves.toMatchObject({ op: "sessions.list" });
  });
  it.each(["kein JSON", JSON.stringify({ v: 1, type: "connection", state: "online", epoch: null, token: "unzulässig" })])(
    "beendet bei ungültigem öffentlichen Frame den Retry (%s)", async (raw) => {
      const { gateway, client } = setup();
      client.start(); await settle();
      gateway.socket.raw(raw);
      expect(client.getSnapshot().state).toBe("incompatible");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(gateway.sockets).toHaveLength(1);
    });
  it("ordnet Antworten exakt nach ID und Op zu", async () => {
    const { gateway, client } = setup();
    gateway.handle = () => true;
    client.start(); await settle();
    const pending = client.request({ op: "session.stop", sessionId: "a" }).catch((error: unknown) => error);
    const sent = gateway.sent[0]!;
    gateway.socket.receive({ v: 1, type: "result", id: sent.id, op: "sessions.list", data: { sessions: [], hasMore: false } });
    expect(await pending).toMatchObject({ outcome: "unknown" });
    expect(client.getSnapshot().state).toBe("incompatible");
  });
  it.each(["message.submit", "session.stop", "session.steer"] as const)("Timeout von %s ist unknown und kein Replay", async (op) => {
    const { gateway, client } = setup();
    gateway.handle = () => true;
    client.start(); await settle();
    const operation = op === "message.submit" ? { op, sessionId: "a", text: "Frage" }
      : op === "session.steer" ? { op, sessionId: "a", text: "Steuern" } : { op, sessionId: "a" };
    const result = client.request(operation).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs);
    expect(await result).toMatchObject({ code: "RPC_TIMEOUT", outcome: "unknown" });
    expect(gateway.sent).toHaveLength(1);
  });
  it("unterscheidet lokale Sendverluste und nicht gesendete Offline-Aktionen", async () => {
    const { gateway, client } = setup();
    await expect(client.request({ op: "session.stop", sessionId: "a" })).rejects.toMatchObject({ outcome: "not_sent" });
    client.start(); await settle();
    gateway.socket.throwOnSend = true;
    await expect(client.request({ op: "message.submit", sessionId: "a", text: "A" })).rejects.toMatchObject({ outcome: "unknown" });
    await expect(client.request({ op: "sessions.list" })).rejects.toMatchObject({ outcome: "not_sent" });
  });
  it("lässt Pending-Submit bei Rotation offen, hält Stop-Reserve frei und replayt nichts", async () => {
    const { gateway, client } = setup();
    client.start(); await settle();
    for (let index = 0; index < chatPolicy.rotateAt - 1; index++) await client.request({ op: "sessions.list" });
    let submit: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "message.submit") { submit = frame; return true; } return false; };
    const result = client.request({ op: "message.submit", sessionId: "a", text: "einmal" });
    expect(gateway.sockets).toHaveLength(1);
    await expect(client.request({ op: "sessions.list" })).rejects.toMatchObject({ code: "CLIENT_BUSY", outcome: "not_sent" });
    await client.ready(true);
    await client.request({ op: "session.stop", sessionId: "a" });
    expect(gateway.sockets).toHaveLength(1);
    gateway.socket.result(submit!, { status: "queued", userRowId: null });
    await result; await settle();
    expect(gateway.sockets).toHaveLength(2);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it("entwertet offene Reads bei Rotation und ignoriert alte Socketframes", async () => {
    const { gateway, client } = setup();
    client.start(); await settle();
    for (let index = 0; index < chatPolicy.rotateAt - 1; index++) await client.request({ op: "sessions.list" });
    gateway.handle = () => true;
    const oldSocket = gateway.socket;
    const read = client.request({ op: "history.read", sessionId: "a" }).catch((error: unknown) => error);
    expect(await read).toMatchObject({ outcome: "not_sent", code: "CONNECTION_CLOSED" });
    await settle();
    oldSocket.raw("kein JSON");
    expect(client.getSnapshot().state).toBe("online");
    expect(gateway.sockets).toHaveLength(2);
  });
  it("begrenzt den Handshake und Backoff und räumt bei Dispose alle Timer auf", async () => {
    const { gateway, client } = setup();
    gateway.autoOnline = false;
    client.start();
    await vi.advanceTimersByTimeAsync(chatPolicy.readyTimeoutMs + chatPolicy.retryInitialMs);
    expect(gateway.sockets).toHaveLength(2);
    client.dispose("v2-disabled");
    expect(gateway.socket.closeReason).toBe("v2-disabled");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(gateway.sockets).toHaveLength(2);
  });
  it("beendet 1008 ohne Auto-Retry; expliziter Reconnect ist möglich", async () => {
    const { gateway, client } = setup();
    client.start(); await settle();
    gateway.socket.drop(1008);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(gateway.sockets).toHaveLength(1);
    client.reconnect(); await settle();
    expect(gateway.sockets).toHaveLength(2);
  });
  it("hält auch bei vielen Pending-Reads Slots für Stop frei", async () => {
    const { gateway, client } = setup();
    gateway.handle = (frame) => frame.op === "sessions.list";
    client.start(); await settle();
    const reads = Array.from({ length: chatPolicy.ordinaryPending }, () => client.request({ op: "sessions.list" }).catch(() => null));
    await expect(client.request({ op: "sessions.list" })).rejects.toMatchObject({ code: "CLIENT_BUSY" });
    await expect(client.request({ op: "session.stop", sessionId: "a" })).resolves.toMatchObject({ op: "session.stop" });
    client.dispose(); await Promise.all(reads);
  });
  it("begrenzt die lokale WebSocket-Sendqueue vor dem Send ohne unknown zu behaupten", async () => {
    const { gateway, client } = setup(); client.start(); await settle();
    gateway.socket.bufferedAmount = chatPolicy.maxBufferedSendBytes;
    await expect(client.request({ op: "message.submit", sessionId: "a", text: "A" })).rejects.toMatchObject({ code: "CLIENT_BUSY", outcome: "not_sent" });
    expect(gateway.sent).toHaveLength(0);
  });
  it.each(["queued", "steered", "redirected"] as const)("wandelt verlorene %s-Antwort durch verspätetes Resultat nicht in einen automatischen Retry um", async (status) => {
    const { gateway, client } = setup(); gateway.handle = () => true;
    client.start(); await settle();
    const pending = client.request({ op: "message.submit", sessionId: "a", text: "einmal" }).catch((error: unknown) => error);
    const sent = gateway.sent[0]!;
    await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs);
    expect(await pending).toMatchObject({ outcome: "unknown" });
    gateway.socket.result(sent, { status, userRowId: null });
    expect(gateway.sent).toHaveLength(1);
    expect(client.getSnapshot().state).toBe("online");
  });
  it("begrenzt erfolglose Reconnects und erfordert danach eine bewusste Entscheidung", async () => {
    const { gateway, client } = setup(); gateway.autoOnline = false; client.start();
    await vi.advanceTimersByTimeAsync((chatPolicy.readyTimeoutMs + chatPolicy.retryMaxMs) * (chatPolicy.maxRetries + 1));
    expect(client.getSnapshot()).toMatchObject({ state: "offline", error: { code: "GATEWAY_OFFLINE" } });
    const count = gateway.sockets.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(gateway.sockets).toHaveLength(count);
    expect(count).toBe(chatPolicy.maxRetries + 1);
  });
});
