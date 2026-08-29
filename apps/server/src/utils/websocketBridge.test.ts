import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { describe, expect, it } from "vitest";
import { bridgeWebSockets, rawDataBytes, type WebSocketBridgeEvent } from "./websocketBridge.js";

class FakeSocket extends EventEmitter {
  readyState: number;
  bufferedAmount = 0;
  readonly sent: Array<{ data: WebSocket.RawData; binary: boolean }> = [];
  readonly closes: Array<{ code?: number; reason?: string }> = [];
  terminateCalls = 0;
  throwOnSend = false;

  constructor(readyState: number) {
    super();
    this.readyState = readyState;
  }

  send(data: WebSocket.RawData, options: { binary: boolean }) {
    if (this.throwOnSend) throw new Error("send failed");
    this.sent.push({ data, binary: options.binary });
  }

  close(code?: number, reason?: string) {
    this.closes.push({
      ...(code === undefined ? {} : { code }),
      ...(reason === undefined ? {} : { reason }),
    });
    this.readyState = WebSocket.CLOSED;
  }

  terminate() {
    this.terminateCalls += 1;
    this.readyState = WebSocket.CLOSED;
  }
}

function socket(value: FakeSocket): WebSocket {
  return value as unknown as WebSocket;
}

describe("WebSocket-Bridge", () => {
  it("zählt Buffer-Arrays und leitet pending Nachrichten geordnet weiter", () => {
    expect(rawDataBytes([Buffer.from("ab"), Buffer.from("c")])).toBe(3);
    const source = new FakeSocket(WebSocket.OPEN);
    const target = new FakeSocket(WebSocket.CONNECTING);
    bridgeWebSockets(socket(source), socket(target), { label: "Test", pendingLimit: 10, bufferedLimit: 20 });

    source.emit("message", Buffer.from("one"), true);
    source.emit("message", "two", false);
    target.readyState = WebSocket.OPEN;
    target.emit("open");

    expect(target.sent.map(({ data }) => data.toString())).toEqual(["one", "two"]);
    expect(target.sent.map(({ binary }) => binary)).toEqual([true, false]);
  });

  it("schließt bei übergroßer Pending-Queue deterministisch mit 1013", () => {
    const source = new FakeSocket(WebSocket.OPEN);
    const target = new FakeSocket(WebSocket.CONNECTING);
    bridgeWebSockets(socket(source), socket(target), { label: "Test", pendingLimit: 2, bufferedLimit: 20 });

    source.emit("message", Buffer.from("too large"), true);

    expect(source.closes[0]?.code).toBe(1013);
    expect(target.terminateCalls).toBe(1);
  });

  it("begrenzt den verbundenen Zielpuffer und mappt unnormale Close-Codes", () => {
    const source = new FakeSocket(WebSocket.OPEN);
    const target = new FakeSocket(WebSocket.OPEN);
    target.bufferedAmount = 19;
    bridgeWebSockets(socket(source), socket(target), { label: "Test", pendingLimit: 10, bufferedLimit: 20 });

    source.emit("message", Buffer.from("too large"), true);
    expect(source.closes[0]?.code).toBe(1013);
    expect(target.terminateCalls).toBe(1);

    const openSource = new FakeSocket(WebSocket.OPEN);
    const openTarget = new FakeSocket(WebSocket.OPEN);
    bridgeWebSockets(socket(openSource), socket(openTarget), { label: "Test" });
    openSource.emit("close", 1006, Buffer.from("abnormal"));
    expect(openTarget.closes[0]?.code).toBe(1011);
  });

  it("meldet Weiterleitung, Überlast und Close für die Betriebsmetriken", () => {
    const source = new FakeSocket(WebSocket.OPEN);
    const target = new FakeSocket(WebSocket.OPEN);
    const events: Array<{ type: string; bytes?: number }> = [];
    bridgeWebSockets(socket(source), socket(target), {
      label: "Test",
      bufferedLimit: 3,
      observer: { onEvent: (event) => events.push(event) },
    });

    source.emit("message", Buffer.from("ok"), true);
    source.emit("message", Buffer.from("zu groß"), true);

    expect(events).toEqual(expect.arrayContaining([
      { type: "forwarded", direction: "source-to-target", bytes: 2 },
      expect.objectContaining({ type: "overload" }),
    ]));
    expect(source.closes[0]?.code).toBe(1013);
  });

  it("begrenzt auch einen großen Slow-Consumer-Burst ohne wachsende Pending-Liste", () => {
    const source = new FakeSocket(WebSocket.OPEN);
    const target = new FakeSocket(WebSocket.OPEN);
    const events: WebSocketBridgeEvent[] = [];
    const originalSend = target.send.bind(target);
    target.send = (data, options) => {
      originalSend(data, options);
      target.bufferedAmount += rawDataBytes(data);
    };
    bridgeWebSockets(socket(source), socket(target), {
      label: "Burst",
      bufferedLimit: 32,
      observer: { onEvent: (event) => events.push(event) },
    });

    for (let index = 0; index < 10_000; index += 1) source.emit("message", Buffer.alloc(8), true);

    expect(target.sent.length).toBe(4);
    expect(target.bufferedAmount).toBe(32);
    expect(events.filter((event) => event.type === "overload")).toHaveLength(1);
    expect(source.closes[0]?.code).toBe(1013);
  });
});
