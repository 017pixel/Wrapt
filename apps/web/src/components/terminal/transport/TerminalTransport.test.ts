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
  onclose: (() => void) | null = null;
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

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

afterEach(() => {
  FakeWebSocket.instances.length = 0;
  vi.unstubAllGlobals();
  vi.resetModules();
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
