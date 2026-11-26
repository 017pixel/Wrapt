// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { useTerminalOutput } from "./useTerminalOutput";
import { maximumParkedOutputBytes } from "./terminal-constants";

test("gibt große geparkte Ausgabe vollständig wieder und bewahrt ANSI-Sequenzen", () => {
  const write = vi.fn();
  const { result, unmount } = renderHook(() => useTerminalOutput({
    terminalRef: { current: { write } as unknown as Terminal }, activeRef: { current: false },
    sessionRef: { current: "session" }, replayBufferRef: { current: [] }, send: () => true, setError: vi.fn(),
  }));
  const output = `\x1b[31m${"x".repeat(maximumParkedOutputBytes)}\x1b[0m`;
  act(() => result.current.queueOutput(output));
  expect(write).toHaveBeenCalledExactlyOnceWith(output);
  act(() => { result.current.queueOutput("danach"); result.current.flushOutput(true); });
  expect(write.mock.calls.map(([data]) => data).join("")).toBe(`${output}danach`);
  unmount();
});

test("begrenzt Ausgabe im versteckten Tab ohne Animation-Frame", () => {
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const write = vi.fn();
  const { result, unmount } = renderHook(() => useTerminalOutput({
    terminalRef: { current: { write } as unknown as Terminal }, activeRef: { current: true },
    sessionRef: { current: "session" }, replayBufferRef: { current: [] }, send: () => true, setError: vi.fn(),
  }));
  const chunk = "x".repeat(maximumParkedOutputBytes);
  act(() => result.current.queueOutput(chunk));
  expect(write).not.toHaveBeenCalled();
  act(() => result.current.queueOutput(chunk));
  expect(write).toHaveBeenCalledOnce();
  expect(vi.mocked(write).mock.calls[0]![0]).toHaveLength(maximumParkedOutputBytes * 2);
  visibility.mockRestore();
  unmount();
});

test("schreibt beim Verstecken des Tabs vorhandene Ausgabe sofort", () => {
  const write = vi.fn();
  const { result, unmount } = renderHook(() => useTerminalOutput({
    terminalRef: { current: { write } as unknown as Terminal }, activeRef: { current: true },
    sessionRef: { current: "session" }, replayBufferRef: { current: [] }, send: () => true, setError: vi.fn(),
  }));
  act(() => result.current.queueOutput("wichtig"));
  expect(write).not.toHaveBeenCalled();

  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => globalThis.document.dispatchEvent(new Event("visibilitychange")));

  expect(write).toHaveBeenCalledExactlyOnceWith("wichtig");
  visibility.mockRestore();
  unmount();
});
