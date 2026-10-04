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
