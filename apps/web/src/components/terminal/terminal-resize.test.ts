// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { attachTerminalAppearance } from "./terminal-appearance";

afterEach(() => vi.restoreAllMocks());

test("verarbeitet weitere Größenänderungen nach dem ersten Frame und räumt auf", () => {
  let notifyResize = () => {};
  class Observer {
    constructor(callback: () => void) { notifyResize = callback; }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
  let runFrame: FrameRequestCallback = () => {};
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { runFrame = callback; return 17; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const terminal = { rows: 24, refresh: vi.fn(), options: { fontSize: 14 } } as unknown as Terminal;
  const resize = vi.fn();
  const resizeRef = { current: null as number | null };
  const cleanup = attachTerminalAppearance(terminal, document.createElement("div"), {
    terminalRef: { current: terminal }, disposedRef: { current: false }, compactRef: { current: false }, renderScaleRef: { current: 1 }, resizeRef, themeRefreshRef: { current: null }, resize,
  });
  try {
    notifyResize();
    notifyResize();
    runFrame(1);
    expect(resize).toHaveBeenCalledOnce();
    expect(resizeRef.current).toBeNull();
    notifyResize();
    runFrame(2);
    expect(resize).toHaveBeenCalledTimes(2);
    notifyResize();
    cleanup();
    expect(cancel).toHaveBeenCalledWith(17);
    expect(resizeRef.current).toBeNull();
  } finally { cleanup(); vi.unstubAllGlobals(); }
});
