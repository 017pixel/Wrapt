import type { Terminal } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";
import { applyTerminalFontSize } from "./terminal-appearance";

function terminal(fontSize: number, rows = 30) {
  return { options: { fontSize }, rows, refresh: vi.fn() } as unknown as Terminal;
}

describe("Terminal-Schrift bei kompakter Shell", () => {
  it("passt die bestehende Instanz an und zeichnet ihre Zeilen neu", () => {
    const instance = terminal(14);
    expect(applyTerminalFontSize(instance, true)).toBe(true);
    expect(instance.options.fontSize).toBe(13);
    expect(instance.refresh).toHaveBeenCalledWith(0, 29);
  });

  it("vermeidet Neuzeichnen bei unveränderter Schriftgröße", () => {
    const instance = terminal(14);
    expect(applyTerminalFontSize(instance, false)).toBe(false);
    expect(instance.refresh).not.toHaveBeenCalled();
  });

  it("überspringt Neuzeichnen, solange noch keine Zeilen existieren", () => {
    const instance = terminal(14, 0);
    expect(applyTerminalFontSize(instance, true)).toBe(true);
    expect(instance.options.fontSize).toBe(13);
    expect(instance.refresh).not.toHaveBeenCalled();
  });
});
