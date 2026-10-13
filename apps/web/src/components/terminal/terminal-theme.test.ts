// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminalColorResolver, terminalThemesEqual, themeFromDashboard } from "./terminal-theme";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubDashboard(values: Record<string, string>) {
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({
    getPropertyValue: (name: string) => values[name] ?? "",
  }) as unknown as CSSStyleDeclaration);
}

describe("Terminal-Farbauflösung", () => {
  it("reicht Hex-Farben unverändert an xterm weiter", () => {
    const resolve = createTerminalColorResolver();
    expect(resolve("#346bf1")).toBe("#346bf1");
    expect(resolve("#346bf180")).toBe("#346bf180");
    expect(resolve(" #fff ")).toBe("#fff");
  });

  it("lässt Werte ohne Canvas (Tests, Node) unangetastet statt sie zu verfälschen", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const resolve = createTerminalColorResolver();
    expect(resolve("color-mix(in oklab, #346bf1 28%, transparent)")).toBe("color-mix(in oklab, #346bf1 28%, transparent)");
  });
});

describe("Theme aus dem Dashboard", () => {
  it("übernimmt Hintergrund, Text, Cursor, Auswahl und ANSI-Palette aus den Tokens", () => {
    stubDashboard({
      "--color-ink-950": "#0b0b0b",
      "--color-text": "#f0f0f0",
      "--ansi-green": "#9fbe8f",
      "--ansi-selection": "#346bf147",
      "--ansi-red": "#d98b8b",
      "--ansi-bright-white": "#f1efe9",
    });

    const theme = themeFromDashboard(document.createElement("div"));

    expect(theme.background).toBe("#0b0b0b");
    expect(theme.foreground).toBe("#f0f0f0");
    expect(theme.cursor).toBe("#9fbe8f");
    expect(theme.cursorAccent).toBe("#0b0b0b");
    expect(theme.selectionBackground).toBe("#346bf147");
    expect(theme.red).toBe("#d98b8b");
    expect(theme.brightWhite).toBe("#f1efe9");
  });

  it("dimmt die Auswahl für das unfokussierte Terminal über die Deckkraft", () => {
    stubDashboard({
      "--color-ink-950": "#0b0b0b",
      "--ansi-selection": "#346bf147",
    });

    const theme = themeFromDashboard(document.createElement("div"));

    expect(theme.selectionInactiveBackground).toBe("rgba(52, 107, 241, 0.153)");
  });

  it("bleibt bei fehlenden Tokens leer, damit xterm seine Standardpalette behält", () => {
    stubDashboard({});

    const theme = themeFromDashboard(document.createElement("div"));

    expect(theme.background).toBe("");
    expect(theme.selectionBackground).toBe("");
    expect(theme.cursorAccent).toBe("");
  });
});

describe("Theme-Vergleich", () => {
  it("erkennt identische und abweichende Paletten feldweise", () => {
    const base = themeFromDashboard(document.createElement("div"));
    const copy = { ...base };

    expect(terminalThemesEqual(base, copy)).toBe(true);
    copy.background = "#123456";
    expect(terminalThemesEqual(base, copy)).toBe(false);
  });
});
