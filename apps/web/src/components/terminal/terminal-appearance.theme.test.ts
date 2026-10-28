// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { attachTerminalAppearance } from "./terminal-appearance";
import { themeFromDashboard } from "./terminal-theme";

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

let palette: Record<string, string> = {};

function stubPalette() {
  palette = {
    "--color-ink-950": "#0a0a0a",
    "--color-text": "#f5f5f5",
    "--ansi-green": "#9fbe8f",
    "--ansi-selection": "#346bf147",
  };
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({
    getPropertyValue: (name: string) => palette[name] ?? "",
  }) as unknown as CSSStyleDeclaration);
}

function createTerminal(theme: ReturnType<typeof themeFromDashboard>) {
  return {
    rows: 24,
    refresh: vi.fn(),
    options: { fontSize: 14, theme },
  } as unknown as Terminal;
}

function attach(terminal: Terminal) {
  return attachTerminalAppearance(terminal, document.createElement("div"), {
    terminalRef: { current: terminal },
    disposedRef: { current: false },
    compactRef: { current: false },
    resizeRef: { current: null },
    themeRefreshRef: { current: null },
    resize: vi.fn(),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

describe("Theme-Synchronisation des laufenden Terminals", () => {
  it("übernimmt eine neue Palette ohne die Instanz oder Sitzung neu aufzubauen", async () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    stubPalette();
    const initial = themeFromDashboard(document.createElement("div"));
    const terminal = createTerminal(initial);
    const cleanup = attach(terminal);
    try {
      palette["--color-ink-950"] = "#1b2c3d";
      palette["--ansi-selection"] = "#88a9cf47";
      document.documentElement.style.setProperty("--color-ink-950", "#1b2c3d");
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(terminal.options.theme).not.toBe(initial);
      const applied = terminal.options.theme as { background?: string; selectionBackground?: string; cursorAccent?: string };
      expect(applied.background).toBe("#1b2c3d");
      expect(applied.selectionBackground).toBe("#88a9cf47");
      expect(applied.cursorAccent).toBe("#1b2c3d");
      expect(terminal.refresh).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("zeichnet fremde HTML-Style-Änderungen nicht neu", async () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    stubPalette();
    const terminal = createTerminal(themeFromDashboard(document.createElement("div")));
    const applied = terminal.options.theme;
    const cleanup = attach(terminal);
    try {
      document.documentElement.style.setProperty("--terminal-sidebar-width", "320px");
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(terminal.options.theme).toBe(applied);
      expect(terminal.refresh).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});
