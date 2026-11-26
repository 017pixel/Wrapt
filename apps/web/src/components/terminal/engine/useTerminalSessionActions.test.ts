// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { RendererRefs } from "./rendererTypes";
import type { RendererCore } from "./rendererCore";
import { useTerminalSessionActions } from "./useTerminalSessionActions";

function setup() {
  const refs = {
    terminalRef: { current: null },
    sessionRef: { current: "session-1" },
    closedRef: { current: false },
    hasLiveStateRef: { current: true },
    fitRef: { current: null },
    ownsGeometryRef: { current: true },
    snapshotReplayRef: { current: false },
    replayBufferRef: { current: [] },
  } as unknown as RendererRefs;
  const sendMessage = vi.fn<(message: unknown) => boolean>(() => true);
  const setStatus = vi.fn();
  const setErrorState = vi.fn();
  const reportMeta = vi.fn();
  const core = { createSession: vi.fn() } as unknown as RendererCore;
  const view = renderHook(() => useTerminalSessionActions({
    refs,
    focusedRef: { current: true },
    instanceId: "runtime-1",
    core,
    sendMessage,
    setErrorState,
    setStatus,
    setPendingPaste: vi.fn(),
    reportMeta,
  }));
  return { ...view, refs, sendMessage, setStatus, setErrorState, reportMeta };
}

test("markiert eine extern beendete Sitzung lokal, ohne terminal.close zu senden", () => {
  const { result, refs, sendMessage, setStatus, reportMeta } = setup();

  act(() => result.current.markSessionClosed());

  expect(refs.closedRef.current).toBe(true);
  expect(refs.sessionRef.current).toBeNull();
  expect(refs.hasLiveStateRef.current).toBe(false);
  expect(setStatus).toHaveBeenLastCalledWith("exited");
  expect(reportMeta).toHaveBeenLastCalledWith({ status: "exited" });
  expect(sendMessage).not.toHaveBeenCalled();
});
