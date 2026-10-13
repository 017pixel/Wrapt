import type { ITheme } from "@xterm/xterm";

/**
 * xterm parst Farben selbst: Hex und `rgb()` mit Kommas direkt, alles andere
 * über ein Canvas. Tokenwerte des Dashboards können aber `color-mix()`,
 * `oklch()` oder `rgb(r g b / a)` sein. Besonders Werte mit Alphakanal lehnt
 * xterm ab und fällt still auf seine Standardfarben zurück, sichtbar zum
 * Beispiel an der Auswahlfarbe. Der Resolver malt einen Tokenwert deshalb in
 * ein 1×1-Canvas und liest das sRGB-Ergebnis samt Deckkraft zurück.
 */
export type TerminalColorResolver = (value: string) => string;

export function createTerminalColorResolver(): TerminalColorResolver {
  let context: CanvasRenderingContext2D | null | undefined;

  const context2d = (): CanvasRenderingContext2D | null => {
    if (context !== undefined) return context;
    context = null;
    if (typeof document === "undefined" || typeof document.createElement !== "function") return context;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      context = canvas.getContext("2d", { willReadFrequently: true });
    } catch {
      context = null;
    }
    return context;
  };

  /** Zeichnet die Farbe über eine deckende Fläche und liest den Pixel zurück. */
  const pixelOver = (background: string, color: string): [number, number, number] | null => {
    const canvas = context2d();
    if (!canvas) return null;
    try {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = background;
      canvas.fillRect(0, 0, 1, 1);
      // Erkennungswert: Bleibt er stehen, hat der Browser die Farbe verworfen.
      canvas.fillStyle = "#010203";
      canvas.fillStyle = color;
      if (canvas.fillStyle === "#010203") return null;
      canvas.fillRect(0, 0, 1, 1);
      const data = canvas.getImageData(0, 0, 1, 1).data;
      return [data[0]!, data[1]!, data[2]!];
    } catch {
      return null;
    }
  };

  return (value) => {
    const raw = value.trim();
    // Hex parst xterm direkt; der Umweg über das Canvas entfällt.
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw;
    if (!raw || !context2d()) return raw;
    const overBlack = pixelOver("#000000", raw);
    const overWhite = pixelOver("#ffffff", raw);
    if (!overBlack || !overWhite) return raw;
    // deckend = farbe * a + hintergrund * (1 - a): Die Differenz der beiden
    // Hintergründe liefert die Deckkraft, der Schwarzanteil die Farbe.
    const alpha = 1 - (
      (overWhite[0] - overBlack[0]) + (overWhite[1] - overBlack[1]) + (overWhite[2] - overBlack[2])
    ) / (3 * 255);
    if (!Number.isFinite(alpha) || alpha <= 0.002) return "rgba(0, 0, 0, 0)";
    const channel = (part: number) => Math.min(255, Math.max(0, Math.round(part / alpha)));
    if (alpha >= 0.998) {
      const hex = (part: number) => part.toString(16).padStart(2, "0");
      return `#${hex(overBlack[0])}${hex(overBlack[1])}${hex(overBlack[2])}`;
    }
    return `rgba(${channel(overBlack[0])}, ${channel(overBlack[1])}, ${channel(overBlack[2])}, ${Number(alpha.toFixed(3))})`;
  };
}

/**
 * Reduziert die Deckkraft einer bereits aufgelösten Farbe. Die Auswahl bleibt
 * damit sichtbar, tritt aber zurück, sobald das Terminal den Fokus verliert —
 * das Verhalten nativer Terminalfenster.
 */
const inactiveSelectionOpacityFactor = 0.55;

function dimTerminalColor(color: string, factor: number): string {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (hex) {
    const red = parseInt(hex[1]!.slice(0, 2), 16);
    const green = parseInt(hex[1]!.slice(2, 4), 16);
    const blue = parseInt(hex[1]!.slice(4, 6), 16);
    const alpha = (hex[2] ? parseInt(hex[2], 16) / 255 : 1) * factor;
    return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`;
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/i.exec(color);
  if (rgba) {
    const alpha = Number(rgba[4]) * factor;
    return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${Number(alpha.toFixed(3))})`;
  }
  return color;
}

/** Feldweiser Vergleich, damit unveränderte Paletten keinen Neuzeichen-Lauf auslösen. */
export function terminalThemesEqual(left: ITheme, right: ITheme): boolean {
  const keys = Object.keys(left) as Array<keyof ITheme>;
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => left[key] === right[key]);
}

/** Liest die aktuelle Wrapt-Palette aus den CSS-Tokens des Mountpunkts. */
export function themeFromDashboard(mount: HTMLElement | null): ITheme {
  const styles = getComputedStyle(mount ?? document.documentElement);
  // Alle Farben kommen ausschließlich aus dem @theme-Block und den
  // Appearance-Tokens. Leere Werte können nur bei einem defekten Theme
  // auftreten; dann greift xterm auf seine Standardpalette zurück.
  const resolve = createTerminalColorResolver();
  const value = (name: string) => resolve(styles.getPropertyValue(name).trim());
  const background = value("--color-ink-950");
  const selection = value("--ansi-selection");
  return {
    background,
    foreground: value("--color-text"),
    cursor: value("--ansi-green"),
    // Text unter dem Blockcursor: die Hintergrundfarbe bleibt lesbar.
    cursorAccent: background,
    selectionBackground: selection,
    // Ohne Fokus tritt die Auswahl zurück, statt zu verschwinden.
    selectionInactiveBackground: dimTerminalColor(selection, inactiveSelectionOpacityFactor),
    black: value("--ansi-black"), red: value("--ansi-red"), green: value("--ansi-green"), yellow: value("--ansi-yellow"),
    blue: value("--ansi-blue"), magenta: value("--ansi-magenta"), cyan: value("--ansi-cyan"), white: value("--ansi-white"),
    brightBlack: value("--ansi-bright-black"), brightRed: value("--ansi-bright-red"), brightGreen: value("--ansi-bright-green"),
    brightYellow: value("--ansi-bright-yellow"), brightBlue: value("--ansi-bright-blue"), brightMagenta: value("--ansi-bright-magenta"),
    brightCyan: value("--ansi-bright-cyan"), brightWhite: value("--ansi-bright-white"),
  };
}
