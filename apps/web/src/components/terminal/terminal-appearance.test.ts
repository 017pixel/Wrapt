import type { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTerminalRenderScale, createTerminalScaleResizeScheduler, terminalScaleResizeDelayMs } from "./terminal-appearance";

afterEach(() => vi.useRealTimers());

function terminal(fontSize: number, rows = 30) {
  return {
    options: { fontSize },
    rows,
    refresh: vi.fn(),
  } as unknown as Terminal;
}

describe("Terminal-Schrift bei Orbit-Zoom", () => {
  it("wendet eine geänderte Zoomstufe auf die bestehende xterm-Instanz an", () => {
    const instance = terminal(14);

    expect(applyTerminalRenderScale(instance, 0.5, false)).toBe(true);
    expect(instance.options.fontSize).toBe(28);
    expect(instance.refresh).toHaveBeenCalledWith(0, 29);
  });

  it("vermeidet Refresh- und Fit-Auslöser bei unveränderter Schriftgröße", () => {
    const instance = terminal(28);

    expect(applyTerminalRenderScale(instance, 0.5, false)).toBe(false);
    expect(instance.refresh).not.toHaveBeenCalled();
  });

  it("überspringt den Refresh, solange xterm noch keine Zeilen hat", () => {
    const instance = terminal(14, 0);

    expect(applyTerminalRenderScale(instance, 0.5, false)).toBe(true);
    expect(instance.options.fontSize).toBe(28);
    expect(instance.refresh).not.toHaveBeenCalled();
  });

  it("behandelt ungültige Zoomwerte als Standardzoom ohne unnötigen Refresh", () => {
    const instance = terminal(14);

    expect(applyTerminalRenderScale(instance, Number.POSITIVE_INFINITY, false)).toBe(false);
    expect(instance.options.fontSize).toBe(14);
    expect(instance.refresh).not.toHaveBeenCalled();
  });
});

describe("Terminal-Resize bei Orbit-Zoom", () => {
  it("fasst schnelle Zoomschritte zu einem PTY-Resize zusammen", () => {
    vi.useFakeTimers();
    const resize = vi.fn();
    const scheduler = createTerminalScaleResizeScheduler(resize);

    scheduler.schedule();
    vi.advanceTimersByTime(terminalScaleResizeDelayMs - 20);
    scheduler.schedule();
    vi.advanceTimersByTime(terminalScaleResizeDelayMs - 20);
    expect(resize).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(resize).toHaveBeenCalledTimes(1);
    scheduler.cancel();
  });

  it("verwirft ein ausstehendes Resize beim Abbau des Renderers", () => {
    vi.useFakeTimers();
    const resize = vi.fn();
    const scheduler = createTerminalScaleResizeScheduler(resize);

    scheduler.schedule();
    scheduler.cancel();
    vi.advanceTimersByTime(terminalScaleResizeDelayMs);

    expect(resize).not.toHaveBeenCalled();
  });
});
