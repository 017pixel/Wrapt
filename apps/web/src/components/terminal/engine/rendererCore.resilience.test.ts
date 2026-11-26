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

function statusSubscription() {
  const listeners: Array<(connected: boolean, reason?: "auth") => void> = [];
  transportMocks.subscribe.mockReturnValue({
    runtimeId: "runtime-1", sessionId: null, send: vi.fn(() => true), onMessage: vi.fn(() => vi.fn()),
    onStatus: vi.fn((listener: (connected: boolean, reason?: "auth") => void) => { listeners.push(listener); return vi.fn(); }),
    retry: vi.fn(), dispose: vi.fn(),
  });
  return listeners;
}

test("verhindert, dass ein verspäteter Snapshot einen beendeten Zustand überschreibt", () => {
  const { core, terminal, refs, deps } = setupCore();
  let finish: (() => void) | undefined;
  terminal.write = vi.fn((_data: string, callback?: () => void) => { finish = callback; });
  core.handleMessage({ type: "terminal.snapshot", sessionId: "session-1", runtimeId: "runtime-1", kind: "shell", status: "running",
    projectId: null, cwd: "/tmp", epoch: 1, sequence: 0, cols: 80, rows: 24, ownsGeometry: true, alternate: false, mouseTracking: false, serialized: "Inhalt" });
  refs.replayBufferRef.current.push("ls\r");
  core.handleMessage({ type: "terminal.exited", sessionId: "session-1", exitCode: 0, signal: null, sequence: 1 });
  deps.setStatus.mockClear();

  finish?.();

  expect(deps.setStatus).not.toHaveBeenCalledWith("connected");
  expect(refs.closedRef.current).toBe(true);
  expect(refs.snapshotReplayRef.current).toBe(false);
  expect(deps.setError).toHaveBeenCalledWith(expect.stringContaining("nicht vollständig gesendet"));
});

test("verhindert, dass ein verspäteter Snapshot einen Delta-Sync zurück auf connecting setzt", () => {
  const { core, terminal, deps } = setupCore();
  let finish: (() => void) | undefined;
  terminal.write = vi.fn((_data: string, callback?: () => void) => { finish = callback; });
  core.handleMessage({ type: "terminal.snapshot", sessionId: "session-1", runtimeId: "runtime-1", kind: "shell", status: "starting",
    projectId: null, cwd: "/tmp", epoch: 1, sequence: 0, cols: 80, rows: 24, ownsGeometry: true, alternate: false, mouseTracking: false, serialized: "" });
  core.handleMessage({ type: "terminal.deltas", sessionId: "session-1", runtimeId: "runtime-1", epoch: 1, startSequence: 1, deltas: [] });
  expect(deps.setStatus).toHaveBeenLastCalledWith("connected");
  deps.setStatus.mockClear();

  finish?.();

  expect(deps.setStatus).not.toHaveBeenCalledWith("connecting");
});

test("meldet beim Verbindungsverlust gepufferte, nie gesendete Eingaben", () => {
  vi.useFakeTimers();
  const listeners = statusSubscription();
  const { core, refs, deps } = setupCore();
  core.attach();
  refs.snapshotReplayRef.current = true;
  refs.replayBufferRef.current.push("ls\r");

  listeners[0]!(false);

  expect(deps.setError).toHaveBeenCalledWith(expect.stringContaining("nicht vollständig gesendet"));
  expect(refs.replayBufferRef.current).toEqual([]);
  expect(refs.snapshotReplayRef.current).toBe(false);
  expect(deps.setStatus).toHaveBeenCalledWith("disconnected");
  core.detach();
});

test("benennt eine abgelehnte Anmeldung statt eine automatische Wiederherstellung zu versprechen", () => {
  vi.useFakeTimers();
  const listeners = statusSubscription();
  const { core, deps } = setupCore();
  core.attach();
  deps.setStatus.mockClear();

  listeners[0]!(false, "auth");

  expect(deps.setError).toHaveBeenLastCalledWith(expect.stringContaining("abgelehnt"));
  expect(deps.setStatus).toHaveBeenLastCalledWith("error");
  core.detach();
});
