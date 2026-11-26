// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";

class FakeWebSocket {
  static readonly instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() { FakeWebSocket.instances.push(this); }

  send(message: string) {
    this.sent.push(message);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

afterEach(() => {
  FakeWebSocket.instances.length = 0;
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.useRealTimers();
});

test("räumt beim letzten Detach sämtliche Transport-Timer auf", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const subscription = terminalTransport.subscribe("runtime-timers");
  FakeWebSocket.instances[0]!.open();
  expect(vi.getTimerCount()).toBe(1);
  subscription.dispose();
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});

test("verbindet einen Socket ohne Pong selbstständig erneut", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const { terminalHeartbeatIntervalMs, terminalHeartbeatTimeoutMs, terminalReconnectDelayMs } = await import("../terminal-constants");
  const subscription = terminalTransport.subscribe("runtime-stalled");
  FakeWebSocket.instances[0]!.open();
  vi.advanceTimersByTime(terminalHeartbeatIntervalMs + terminalHeartbeatTimeoutMs + terminalReconnectDelayMs);
  expect(FakeWebSocket.instances).toHaveLength(2);
  subscription.dispose();
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});

test("meldet socketweite Anmeldefehler allen betroffenen Terminals", async () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const first = terminalTransport.subscribe("runtime-auth-a");
  const second = terminalTransport.subscribe("runtime-auth-b");
  const listener = vi.fn();
  first.onMessage(listener);
  second.onMessage(listener);
  FakeWebSocket.instances[0]!.open();
  FakeWebSocket.instances[0]!.emit({ type: "terminal.error", code: "FORBIDDEN", message: "Kein Zugriff" });
  expect(listener).toHaveBeenCalledTimes(2);
  first.dispose(); second.dispose();
});

test("teilt eine Runtime-Subscription zwischen Renderer und Preview", async () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const rendererMessages: string[] = [];
  const previewMessages: string[] = [];
  const renderer = terminalTransport.subscribe("runtime-1");
  const preview = terminalTransport.subscribe("runtime-1");
  renderer.onMessage((message) => rendererMessages.push(message.type));
  preview.onMessage((message) => previewMessages.push(message.type));

  const socket = FakeWebSocket.instances[0];
  expect(socket).toBeDefined();
  expect(socket!.onmessage).toBeTypeOf("function");
  socket!.open();
  expect(renderer.send({ type: "terminal.subscribe", runtimeId: "runtime-1" })).toBe(true);
  socket!.emit({
    type: "terminal.snapshot",
    sessionId: "session-1",
    runtimeId: "runtime-1",
    kind: "shell",
    status: "running",
    projectId: null,
    cwd: "/tmp",
    epoch: 1,
    sequence: 0,
    cols: 80,
    rows: 24,
    ownsGeometry: true,
    alternate: false,
    mouseTracking: false,
    serialized: "Hallo",
  });
  expect(rendererMessages).toEqual(["terminal.snapshot"]);
  expect(previewMessages).toEqual(["terminal.snapshot"]);
  preview.dispose();
  expect(socket!.sent.map((value) => JSON.parse(value).type)).not.toContain("terminal.unsubscribe");
  renderer.dispose();
  expect(socket!.sent.map((value) => JSON.parse(value).type)).toContain("terminal.unsubscribe");
});

test("meldet einem neuen Renderer den bereits offenen Socket", async () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const subscription = terminalTransport.subscribe("runtime-2");
  const socket = FakeWebSocket.instances[0];
  socket!.open();
  const statuses: boolean[] = [];

  subscription.onStatus((connected) => statuses.push(connected));

  expect(statuses).toEqual([true]);
  subscription.dispose();
});

test("stellt Live-Output nach Socket-Neuaufbau mit Fast Reconnect zu (kein Created)", async () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const first = terminalTransport.subscribe("runtime-3");
  const firstMessages: string[] = [];
  first.onMessage((message) => firstMessages.push(message.type));
  FakeWebSocket.instances[0]!.open();
  FakeWebSocket.instances[0]!.emit({ type: "terminal.created", requestId: "r1", sessionId: "session-3", runtimeId: "runtime-3", kind: "shell", projectId: null, status: "running", cwd: "/tmp", pid: 1 });
  FakeWebSocket.instances[0]!.emit({ type: "terminal.output", sessionId: "session-3", data: "a", sequence: 1 });
  expect(firstMessages).toContain("terminal.output");
  first.dispose();
  await Promise.resolve();

  // Zurückkehren auf die Route: neuer Socket, Resubscribe mit Stand, der
  // Server antwortet nur mit Deltas (kein erneutes Created).
  const second = terminalTransport.subscribe("runtime-3");
  const secondMessages: string[] = [];
  second.onMessage((message) => secondMessages.push(message.type));
  expect(FakeWebSocket.instances).toHaveLength(2);
  FakeWebSocket.instances[1]!.open();
  FakeWebSocket.instances[1]!.emit({ type: "terminal.deltas", sessionId: "session-3", runtimeId: "runtime-3", epoch: 0, startSequence: 2, deltas: [] });
  // Reine Session-Nachrichten (ohne Runtime-ID) müssen trotzdem ankommen:
  // Getippte Eingaben wären sonst erst nach einem Reload sichtbar.
  FakeWebSocket.instances[1]!.emit({ type: "terminal.output", sessionId: "session-3", data: "b", sequence: 2 });
  expect(secondMessages).toContain("terminal.output");
  second.dispose();
});

test("ersetzt einen nach Standby scheinbar offenen Socket sofort und nur einmal", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const subscription = terminalTransport.subscribe("runtime-wake");
  FakeWebSocket.instances[0]!.open();
  vi.setSystemTime(Date.now() + 60_000);
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("pageshow"));
  window.dispatchEvent(new Event("online"));
  expect(FakeWebSocket.instances).toHaveLength(2);
  FakeWebSocket.instances[1]!.open();
  subscription.dispose(); await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
  window.dispatchEvent(new Event("focus"));
  expect(FakeWebSocket.instances).toHaveLength(2);
});

test("prüft bei kurzer Rückkehr die Verbindung und erholt einen hängenden Socket", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const subscription = terminalTransport.subscribe("runtime-probe");
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  window.dispatchEvent(new Event("focus"));
  expect(socket.sent.map((message) => JSON.parse(message).type)).toContain("terminal.ping");
  vi.advanceTimersByTime(2_000);
  expect(FakeWebSocket.instances).toHaveLength(2);
  subscription.dispose(); await Promise.resolve();
});

test("behält eine gesunde Verbindung bei Rückkehr und bei neuen Abos im selben Commit", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const first = terminalTransport.subscribe("runtime-healthy");
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  window.dispatchEvent(new Event("focus"));
  socket.emit({ type: "terminal.pong" });
  first.dispose();
  const second = terminalTransport.subscribe("runtime-other");
  await Promise.resolve();
  vi.advanceTimersByTime(2_500);
  expect(FakeWebSocket.instances).toHaveLength(1);
  second.dispose(); await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});

test("öffnet beim Vorladen keine Shell und räumt ungenutzte Hover-Verbindungen auf", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  terminalTransport.preconnect(); terminalTransport.preconnect();
  expect(FakeWebSocket.instances).toHaveLength(1);
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  expect(socket.sent).toEqual([]);
  vi.advanceTimersByTime(5_000);
  expect(socket.readyState).toBe(3);
  expect(vi.getTimerCount()).toBe(0);
  window.dispatchEvent(new Event("online"));
  expect(FakeWebSocket.instances).toHaveLength(1);
});

test("stoppt nach einem Auth-Close 1008 den Reconnect-Sturm bis zum manuellen Retry", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const subscription = terminalTransport.subscribe("runtime-auth-close");
  const statuses: boolean[] = [];
  subscription.onStatus((connected) => statuses.push(connected));
  FakeWebSocket.instances[0]!.open();
  FakeWebSocket.instances[0]!.close(1008);

  // Kein automatischer Neusturm, auch nicht nach langer Wartezeit.
  vi.advanceTimersByTime(60_000);
  expect(FakeWebSocket.instances).toHaveLength(1);
  expect(statuses).toEqual([true, false]);

  // Der manuelle Retry öffnet einen frischen Socket; der Status meldet den
  // neuen Stand, sodass der Renderer erneut abonnieren kann.
  subscription.retry();
  expect(FakeWebSocket.instances).toHaveLength(2);
  FakeWebSocket.instances[1]!.open();
  expect(statuses).toEqual([true, false, true]);
  subscription.dispose();
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});

test("baut einen offenen Socket beim manuellen Retry neu auf", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const subscription = terminalTransport.subscribe("runtime-retry-open");
  const statuses: boolean[] = [];
  subscription.onStatus((connected) => statuses.push(connected));
  const first = FakeWebSocket.instances[0]!;
  first.open();

  subscription.retry();

  expect(first.readyState).toBe(3);
  expect(FakeWebSocket.instances).toHaveLength(2);
  expect(statuses).toEqual([true, false]);
  subscription.dispose();
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});

test("wartet beim manuellen Retry auf einen laufenden Socket-Aufbau", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const subscription = terminalTransport.subscribe("runtime-retry-connecting");

  subscription.retry();

  expect(FakeWebSocket.instances).toHaveLength(1);
  subscription.dispose();
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});

test("meldet eine abgelehnte Anmeldung mit Grund", async () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const subscription = terminalTransport.subscribe("runtime-auth-reason");
  const statuses: Array<[boolean, string | undefined]> = [];
  subscription.onStatus((connected, reason) => statuses.push([connected, reason]));
  FakeWebSocket.instances[0]!.open();
  FakeWebSocket.instances[0]!.close(1008);

  expect(statuses).toEqual([[true, undefined], [false, "auth"]]);
  subscription.dispose();
});

test("begrenzt identische Größenmeldungen und behandelt send-Fehler ohne Ausnahme", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const subscription = terminalTransport.subscribe("runtime-size");
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  for (let index = 0; index < 50; index++) subscription.send({ type: "terminal.resize", sessionId: "session", cols: 80, rows: 24 });
  expect(socket.sent).toHaveLength(1);
  socket.send = () => { throw new Error("Verbindung verloren"); };
  expect(subscription.send({ type: "terminal.input", sessionId: "session", data: "x" })).toBe(false);
  expect(FakeWebSocket.instances).toHaveLength(2);
  subscription.dispose(); await Promise.resolve();
});
