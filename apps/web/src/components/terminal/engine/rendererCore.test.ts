// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import type { RendererCoreDeps, RendererRefs } from "./rendererTypes";

const transportMocks = vi.hoisted(() => ({ subscribe: vi.fn() }));

vi.mock("../transport/TerminalTransport", () => ({
  terminalTransport: { subscribe: transportMocks.subscribe },
}));

import { createRendererCore } from "./rendererCore";

afterEach(() => vi.useRealTimers());

function ref<T>(current: T) { return { current }; }

function setupCore() {
  const terminal = {
    cols: 80,
    rows: 24,
    modes: { mouseTrackingMode: "none" },
    buffer: { active: { type: "normal", baseY: 200, viewportY: 160 } },
    scrollToLine: vi.fn(),
    reset: vi.fn(),
    resize: vi.fn(),
    write: vi.fn((_data: string, callback?: () => void) => callback?.()),
  } as unknown as Terminal;
  const refs = {
    terminalRef: ref<Terminal | null>(terminal),
    fitRef: ref(null),
    activeRef: ref(true),
    kindRef: ref("shell" as const),
    sessionRef: ref<string | null>(null),
    epochRef: ref(0),
    sequenceRef: ref(0),
    ownsGeometryRef: ref(false),
    hasLiveStateRef: ref(false),
    snapshotReplayRef: ref(false),
    replayBufferRef: ref<string[]>([]),
    mouseTrackingRef: ref(false),
    mouseEncodingRef: ref(false),
    disposedRef: ref(false),
    closedRef: ref(false),
    createRetriesRef: ref(0),
    subscriptionRef: ref(null),
    cwdRef: ref("–"),
  } as RendererRefs;
  const deps = {
    instanceId: "runtime-1",
    kind: "shell",
    projectId: null,
    initialCwd: null,
    mode: "agent",
    accountId: undefined,
    sendMessage: vi.fn<(message: unknown) => boolean>(() => true),
    setStatus: vi.fn(),
    setCwd: vi.fn(),
    setError: vi.fn(),
    setRestartBanner: vi.fn(),
    reportMeta: vi.fn(),
    queueOutput: vi.fn(),
    resetOutput: vi.fn(),
    flushReplayBuffer: vi.fn(),
    fitAndReport: vi.fn(),
  } satisfies RendererCoreDeps;
  return { terminal, refs, deps, core: createRendererCore(refs, deps) };
}

test("startet an einem bereits offenen Transport genau einen Create-Flow", () => {
  const subscription = {
    runtimeId: "runtime-1",
    sessionId: null,
    send: vi.fn(() => true),
    onMessage: vi.fn(() => vi.fn()),
    onStatus: vi.fn((listener: (connected: boolean) => void) => {
      listener(true);
      return vi.fn();
    }),
    retry: vi.fn(),
    dispose: vi.fn(),
  };
  transportMocks.subscribe.mockReturnValue(subscription);
  const { core, deps } = setupCore();

  core.attach();

  expect(deps.sendMessage).toHaveBeenCalledTimes(1);
  expect(deps.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: "terminal.create",
    runtimeId: "runtime-1",
  }));
});

test("beendet die Snapshot-Wiedergabe auch bei leerem Startzustand", () => {
  const { core, terminal, refs, deps } = setupCore();

  core.handleMessage({
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
    serialized: "",
  });

  expect(terminal.write).toHaveBeenCalledWith("\x1bc", expect.any(Function));
  expect(refs.snapshotReplayRef.current).toBe(false);
  expect(deps.flushReplayBuffer).toHaveBeenCalledOnce();
  expect(deps.setStatus).toHaveBeenCalledWith("connected");
});

test("bestätigt einen leeren Delta-Sync als verbunden und übernimmt die Session", () => {
  const { core, refs, deps } = setupCore();
  core.handleMessage({ type: "terminal.deltas", sessionId: "session-1", runtimeId: "runtime-1", epoch: 0, startSequence: 1, deltas: [] });
  expect(refs.sessionRef.current).toBe("session-1");
  expect(deps.setStatus).toHaveBeenCalledWith("connected");
  expect(deps.setError).toHaveBeenCalledWith(null);
});

test("hält nachgelieferte und live empfangene Ausgabe im selben geordneten Puffer", () => {
  const { core, deps } = setupCore();
  core.handleMessage({ type: "terminal.output", sessionId: "session-1", sequence: 1, data: "eins" });
  core.handleMessage({ type: "terminal.deltas", sessionId: "session-1", runtimeId: "runtime-1", epoch: 0, startSequence: 2, deltas: [{ sequence: 2, data: "zwei" }] });
  expect(deps.queueOutput.mock.calls).toEqual([["eins"], ["zwei"]]);
});

 test("ordnet Clear hinter bereits eingereihter Ausgabe ein", () => {
  const { core, terminal, deps } = setupCore();
  terminal.write("alte Ausgabe");
  core.handleMessage({ type: "terminal.cleared", sessionId: "session-1", sequence: 2 });
  expect(deps.resetOutput).toHaveBeenCalledOnce();
  expect(terminal.reset).not.toHaveBeenCalled();
  expect(vi.mocked(terminal.write).mock.calls.map(([data]) => data)).toEqual(["alte Ausgabe", "\x1bc"]);
});

test("bewahrt die Scrollposition beim vollständigen Sync derselben Generation", () => {
  const { core, refs, terminal } = setupCore();
  refs.hasLiveStateRef.current = true;
  core.handleMessage({ type: "terminal.snapshot", sessionId: "session-1", runtimeId: "runtime-1", kind: "shell", status: "running", projectId: null,
    cwd: "/tmp", epoch: 0, sequence: 5, cols: 80, rows: 24, ownsGeometry: true, alternate: false, mouseTracking: false, serialized: "Verlauf" });
  expect(terminal.scrollToLine).toHaveBeenCalledWith(160);
});

test("bündelt wiederholte Sequenzlücken bis zum bestätigten Sync", () => {
  const { core, refs, deps } = setupCore();
  refs.sessionRef.current = "session-1";
  refs.subscriptionRef.current = { retry: vi.fn() } as unknown as NonNullable<RendererRefs["subscriptionRef"]["current"]>;
  for (let sequence = 5; sequence <= 20; sequence++) core.handleMessage({ type: "terminal.output", sessionId: "session-1", sequence, data: "Lücke" });
  expect(deps.sendMessage).toHaveBeenCalledTimes(1);
  core.handleMessage({ type: "terminal.deltas", sessionId: "session-1", runtimeId: "runtime-1", epoch: 0, startSequence: 1, deltas: [] });
  core.handleMessage({ type: "terminal.output", sessionId: "session-1", sequence: 21, data: "neue Lücke" });
  expect(deps.sendMessage).toHaveBeenCalledTimes(2);
});

test("meldet einen laufenden Neustart als connecting und räumt den Banner nach dem Snapshot", () => {
  const { core, deps } = setupCore();
  deps.setError.mockClear();

  core.handleMessage({ type: "terminal.restarting", sessionId: "session-1", reason: "Neuer Versuch 1 von 3", sequence: 1 });
  expect(deps.setStatus).toHaveBeenCalledWith("connecting");
  expect(deps.setError).toHaveBeenCalledWith(null);
  expect(deps.setRestartBanner).toHaveBeenCalledWith({ message: "Neuer Versuch 1 von 3" });

  core.handleMessage({
    type: "terminal.snapshot", sessionId: "session-1", runtimeId: "runtime-1", kind: "shell", status: "starting",
    projectId: null, cwd: "/tmp", epoch: 2, sequence: 0, cols: 80, rows: 24, ownsGeometry: true,
    alternate: false, mouseTracking: false, serialized: "",
  });
  expect(deps.setRestartBanner).toHaveBeenLastCalledWith(null);
  expect(deps.setStatus).toHaveBeenLastCalledWith("connecting");
});

test("erzeugt eine explizit beendete Sitzung nicht automatisch neu", () => {
  vi.useFakeTimers();
  const { core, refs, deps } = setupCore();
  refs.subscriptionRef.current = {} as NonNullable<RendererRefs["subscriptionRef"]["current"]>;
  core.handleMessage({ type: "terminal.exited", sessionId: "session-1", exitCode: 0, signal: null, sequence: 4 });
  expect(refs.closedRef.current).toBe(true);
  deps.sendMessage.mockClear();

  core.handleMessage({ type: "terminal.error", code: "SESSION_NOT_FOUND", message: "Weg", sessionId: "session-1" });
  vi.advanceTimersByTime(1_000);
  expect(deps.sendMessage).not.toHaveBeenCalled();
  expect(deps.setStatus).toHaveBeenCalledWith("exited");
});

test("öffnet beim manuellen Resync den Transport neu und fordert ein volles Subscribe an", () => {
  vi.useFakeTimers();
  const retry = vi.fn();
  const subscription = {
    runtimeId: "runtime-1",
    sessionId: null,
    send: vi.fn(() => true),
    onMessage: vi.fn(() => vi.fn()),
    onStatus: vi.fn(() => vi.fn()),
    retry,
    dispose: vi.fn(),
  };
  transportMocks.subscribe.mockReturnValue(subscription);
  const { core, refs, deps } = setupCore();
  refs.sessionRef.current = "session-1";
  core.attach();

  core.resync();

  expect(retry).toHaveBeenCalledOnce();
  expect(deps.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "terminal.subscribe", runtimeId: "runtime-1" }));
  core.detach();
  expect(vi.getTimerCount()).toBe(0);
});

test("erzeugt nach explizitem Schließen auch bei einem Reconnect keine neue Sitzung", () => {
  vi.useFakeTimers();
  const statusListeners: Array<(connected: boolean) => void> = [];
  transportMocks.subscribe.mockReturnValue({
    runtimeId: "runtime-1",
    sessionId: null,
    send: vi.fn(() => true),
    onMessage: vi.fn(() => vi.fn()),
    onStatus: vi.fn((listener: (connected: boolean) => void) => { statusListeners.push(listener); return vi.fn(); }),
    retry: vi.fn(),
    dispose: vi.fn(),
  });
  const { core, refs, deps } = setupCore();
  core.attach();
  deps.sendMessage.mockClear();
  refs.closedRef.current = true;
  refs.sessionRef.current = null;

  statusListeners[0]!(true);
  vi.advanceTimersByTime(2_000);

  expect(deps.sendMessage).not.toHaveBeenCalled();
  core.detach();
});

test("invalidiert einen ausstehenden Snapshot-Write bei Trennung und Reconnect", () => {
  vi.useFakeTimers();
  const statusListeners: Array<(connected: boolean) => void> = [];
  const subscription = {
    runtimeId: "runtime-1",
    sessionId: null,
    send: vi.fn(() => true),
    onMessage: vi.fn(() => vi.fn()),
    onStatus: vi.fn((listener: (connected: boolean) => void) => { statusListeners.push(listener); return vi.fn(); }),
    retry: vi.fn(),
    dispose: vi.fn(),
  };
  transportMocks.subscribe.mockReturnValue(subscription);
  const { core, terminal, refs, deps } = setupCore();
  let finishSnapshot: (() => void) | undefined;
  terminal.write = vi.fn((_data: string, callback?: () => void) => { finishSnapshot = callback; });
  core.attach();
  statusListeners[0]!(true);

  core.handleMessage({
    type: "terminal.snapshot", sessionId: "session-1", runtimeId: "runtime-1", kind: "shell", status: "running",
    projectId: null, cwd: "/tmp", epoch: 1, sequence: 0, cols: 80, rows: 24, ownsGeometry: true,
    alternate: false, mouseTracking: false, serialized: "Inhalt",
  });
  expect(refs.snapshotReplayRef.current).toBe(true);
  refs.replayBufferRef.current.push("\x1b[A");
  deps.setStatus.mockClear();

  statusListeners[0]!(false);
  expect(refs.snapshotReplayRef.current).toBe(false);
  expect(refs.replayBufferRef.current).toEqual([]);
  finishSnapshot?.();
  expect(deps.setStatus).not.toHaveBeenCalledWith("connected");
  core.detach();
});

test("beendet eine hängende Snapshot-Wiedergabe, wenn Deltas den Sync bestätigen", () => {
  const { core, refs, deps } = setupCore();
  refs.snapshotReplayRef.current = true;
  refs.replayBufferRef.current.push("ls\r");

  core.handleMessage({ type: "terminal.deltas", sessionId: "session-1", runtimeId: "runtime-1", epoch: 2, startSequence: 1, deltas: [] });

  expect(refs.snapshotReplayRef.current).toBe(false);
  expect(deps.flushReplayBuffer).toHaveBeenCalledOnce();
  expect(deps.setStatus).toHaveBeenCalledWith("connected");
});

test("begrenzt ausbleibende Sync-Antworten auf drei Wiederholungen", async () => {
  vi.useFakeTimers();
  const subscription = {
    runtimeId: "runtime-1",
    sessionId: null,
    send: vi.fn(() => true),
    onMessage: vi.fn(() => vi.fn()),
    onStatus: vi.fn((listener: (connected: boolean) => void) => { listener(true); return vi.fn(); }),
    retry: vi.fn(),
    dispose: vi.fn(),
  };
  transportMocks.subscribe.mockReturnValue(subscription);
  const { core, deps } = setupCore();
  core.attach();
  core.handleMessage({ type: "terminal.created", requestId: "r1", sessionId: "session-1", runtimeId: "runtime-1", kind: "shell", projectId: null, status: "starting", cwd: "/tmp", pid: 1 });
  // create + erstes subscribe
  expect(deps.sendMessage.mock.calls.map(([message]) => (message as { type: string }).type)).toEqual(["terminal.create", "terminal.subscribe"]);

  for (let attempt = 0; attempt < 3; attempt++) {
    await vi.advanceTimersByTimeAsync(5_000);
    expect(deps.sendMessage.mock.calls.at(-1)?.[0]).toMatchObject({ type: "terminal.subscribe" });
  }
  await vi.advanceTimersByTimeAsync(5_000);
  expect(deps.sendMessage.mock.calls.filter(([message]) => (message as { type: string }).type === "terminal.subscribe")).toHaveLength(4);
  expect(deps.setError).toHaveBeenLastCalledWith(expect.stringContaining("antwortet nicht"));
  expect(deps.setStatus).toHaveBeenLastCalledWith("error");
});

test("startet nach einem erschöpften Sync über den manuellen Resync einen vollen neuen Lauf", async () => {
  vi.useFakeTimers();
  transportMocks.subscribe.mockReturnValue({
    runtimeId: "runtime-1", sessionId: null, send: vi.fn(() => true), onMessage: vi.fn(() => vi.fn()),
    onStatus: vi.fn((listener: (connected: boolean) => void) => { listener(true); return vi.fn(); }),
    retry: vi.fn(), dispose: vi.fn(),
  });
  const { core, deps } = setupCore();
  const subscribes = () => deps.sendMessage.mock.calls.filter(([message]) => (message as { type: string }).type === "terminal.subscribe").length;
  core.attach();
  core.handleMessage({ type: "terminal.created", requestId: "r1", sessionId: "session-1", runtimeId: "runtime-1", kind: "shell", projectId: null, status: "starting", cwd: "/tmp", pid: 1 });
  for (let attempt = 0; attempt < 4; attempt++) await vi.advanceTimersByTimeAsync(5_000);
  expect(deps.setError).toHaveBeenLastCalledWith(expect.stringContaining("antwortet nicht"));

  core.resync();
  deps.setError.mockClear();
  expect(subscribes()).toBe(5);
  for (let attempt = 0; attempt < 3; attempt++) await vi.advanceTimersByTimeAsync(5_000);
  expect(deps.setError).not.toHaveBeenCalled();
  expect(subscribes()).toBe(8);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(deps.setError).toHaveBeenLastCalledWith(expect.stringContaining("antwortet nicht"));
  core.detach();
});
