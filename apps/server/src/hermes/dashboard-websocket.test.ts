import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { expect, it } from "vitest";
import { bridgeHermesWebSockets } from "./dashboard-proxy.js";
import type { WebSocketBridgeEvent } from "../utils/websocketBridge.js";
import { settings } from "../config/settings.js";

class SlowSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  closedCode: number | undefined;
  readonly messages: Array<{ data: WebSocket.RawData; binary: boolean }> = [];
  send(data: WebSocket.RawData, { binary }: { binary: boolean }) {
    this.bufferedAmount += Array.isArray(data) ? data.reduce((sum, chunk) => sum + chunk.byteLength, 0) : data.byteLength;
    this.messages.push({ data, binary });
  }
  close(code?: number) { this.closedCode = code; this.readyState = WebSocket.CLOSED; }
  terminate() { this.readyState = WebSocket.CLOSED; }
}
const socket = (value: SlowSocket) => value as unknown as WebSocket;

it("begrenzt 64-MiB-Slow-Consumer-Bursts im OPEN-Zustand und meldet Überlast genau einmal", () => {
  const source = new SlowSocket();
  const target = new SlowSocket();
  const events: WebSocketBridgeEvent[] = [];
  bridgeHermesWebSockets(socket(source), socket(target), { onEvent: (event) => events.push(event) });
  for (let index = 0; index < 1_024; index += 1) target.emit("message", Buffer.alloc(65_536), true);
  expect(source.bufferedAmount).toBeLessThanOrEqual(settings.hermesWebSocketBufferedBytes);
  expect(source.closedCode).toBe(1013);
  expect(events.filter((event) => event.type === "overload")).toHaveLength(1);
  expect(target.readyState).toBe(WebSocket.CLOSED);
});

it("überträgt ein großes normales Frame allein und begrenzt weitere Frames bis zum Drain", () => {
  const source = new SlowSocket();
  const target = new SlowSocket();
  bridgeHermesWebSockets(socket(source), socket(target));
  const large = Buffer.alloc(4 * 1024 * 1024);
  target.emit("message", large, true);
  expect(source.messages[0]?.data).toBe(large);
  expect(source.messages[0]?.binary).toBe(true);
  expect(source.closedCode).toBeUndefined();
  target.emit("message", Buffer.from("mehr"), false);
  expect(source.closedCode).toBe(1013);
});

it("erhält geordnete Handshake-Nachrichten, binär/Text und Hermes-Close-Codes", () => {
  const source = new SlowSocket();
  const target = new SlowSocket();
  target.readyState = WebSocket.CONNECTING;
  bridgeHermesWebSockets(socket(source), socket(target));
  source.emit("message", Buffer.from("resize"), false);
  source.emit("message", Buffer.from([1, 2, 3]), true);
  target.readyState = WebSocket.OPEN;
  target.emit("open");
  expect(target.messages.map((message) => message.binary)).toEqual([false, true]);
  target.emit("close", 4410, Buffer.from("ended"));
  expect(source.closedCode).toBe(4410);
});

it("überträgt den geordneten Replay nach einer überlasteten Verbindung vollständig", () => {
  const history = Array.from({ length: 20 }, (_, index) => Buffer.from(`Zeile ${index}\n`));
  const source = new SlowSocket();
  const target = new SlowSocket();
  bridgeHermesWebSockets(socket(source), socket(target));
  source.bufferedAmount = settings.hermesWebSocketBufferedBytes;
  target.emit("message", history[0], true);
  expect(source.closedCode).toBe(1013);
  const returned = new SlowSocket();
  const upstream = new SlowSocket();
  bridgeHermesWebSockets(socket(returned), socket(upstream));
  for (const message of history) { upstream.emit("message", message, true); returned.bufferedAmount = 0; }
  expect(returned.messages.map(({ data }) => data.toString())).toEqual(history.map((data) => data.toString()));
  expect(returned.closedCode).toBeUndefined();
});
