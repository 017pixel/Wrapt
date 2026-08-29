import { expect, test, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import type { RendererCoreDeps, RendererRefs } from "./rendererTypes";

const transportMocks = vi.hoisted(() => ({ subscribe: vi.fn() }));

vi.mock("../transport/TerminalTransport", () => ({
  terminalTransport: { subscribe: transportMocks.subscribe },
}));

import { createRendererCore } from "./rendererCore";

function ref<T>(current: T) { return { current }; }

function setupCore() {
  const terminal = {
    cols: 80,
    rows: 24,
    modes: { mouseTrackingMode: "none" },
    reset: vi.fn(),
    resize: vi.fn(),
    write: vi.fn(),
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
    resizeFrameRef: ref<number | null>(null),
    cwdRef: ref("–"),
  } as RendererRefs;
  const deps = {
    instanceId: "runtime-1",
    kind: "shell",
    projectId: null,
    initialCwd: null,
    mode: "agent",
    accountId: undefined,
    sendMessage: vi.fn(() => true),
    setStatus: vi.fn(),
    setCwd: vi.fn(),
    setError: vi.fn(),
    setRestartBanner: vi.fn(),
    reportMeta: vi.fn(),
    queueOutput: vi.fn(),
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

  expect(terminal.write).not.toHaveBeenCalled();
  expect(refs.snapshotReplayRef.current).toBe(false);
  expect(deps.flushReplayBuffer).toHaveBeenCalledOnce();
  expect(deps.setStatus).toHaveBeenCalledWith("connected");
});
