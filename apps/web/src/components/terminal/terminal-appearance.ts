import type { MutableRefObject } from "react";
import type { ITheme, Terminal } from "@xterm/xterm";
import { isCompactTerminal, terminalFontSizeForRenderScale } from "./terminal-utils";
import { terminalThemesEqual, themeFromDashboard } from "./terminal-theme";

export const terminalScaleResizeDelayMs = 120;

export interface TerminalScaleResizeScheduler {
  schedule(): void;
  cancel(): void;
}

/** Bündelt PTY-Größenmeldungen während Orbit-Zoombewegungen bis zum Stillstand. */
export function createTerminalScaleResizeScheduler(resize: () => void): TerminalScaleResizeScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        resize();
      }, terminalScaleResizeDelayMs);
    },
    cancel() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}

/** Gemeinsame Zustände für die Anpassung von Schrift, Theme und Raster. */
export interface TerminalAppearanceContext {
  disposedRef: MutableRefObject<boolean>;
  terminalRef: MutableRefObject<Terminal | null>;
  compactRef: MutableRefObject<boolean>;
  renderScaleRef: MutableRefObject<number>;
  resizeRef: MutableRefObject<number | null>;
  themeRefreshRef: MutableRefObject<number | null>;
  resize(): void;
}

export function applyTerminalRenderScale(terminal: Terminal, renderScale: number, compact: boolean): boolean {
  const fontSize = terminalFontSizeForRenderScale(renderScale, compact);
  if (terminal.options.fontSize === fontSize) return false;
  terminal.options.fontSize = fontSize;
  if (terminal.rows > 0) terminal.refresh(0, terminal.rows - 1);
  return true;
}

/**
 * Hängt die Anpassungs-Observer (Schriftladen, Shell-Kompaktheit, Theme,
 * Rastergröße, visueller Viewport) an eine xterm-Instanz. Gibt die
 * Aufräumfunktion zurück, die Observer trennt und offene Timer beendet.
 */
export function attachTerminalAppearance(terminal: Terminal, mount: HTMLElement, context: TerminalAppearanceContext): () => void {
  const { disposedRef, terminalRef, compactRef, renderScaleRef, resizeRef, themeRefreshRef, resize } = context;

  // Nach dem asynchronen Laden der Schriften (Fallback → JetBrains Mono)
  // stimmen die Zellmetriken wieder; ein Refresh verhindert den Versatz um
  // eine halbe Zeile.
  if (typeof document.fonts?.ready?.then === "function") {
    void document.fonts.ready.then(() => {
      if (disposedRef.current || terminalRef.current !== terminal) return;
      terminal.refresh(0, terminal.rows - 1);
      resize();
    });
  }

  // Wechsel der Shell-Kompaktheit (Desktop ↔ Mobile) passt die Schriftgröße
  // an, damit TUIs im schmalen Viewport kompakt bleiben.
  const shellRoot = mount.closest(".app-shell");
  const shellObserver = new MutationObserver(() => {
    const compact = isCompactTerminal(mount);
    if (compact === compactRef.current) return;
    compactRef.current = compact;
    if (applyTerminalRenderScale(terminal, renderScaleRef.current, compact)) resize();
  });
  if (shellRoot) shellObserver.observe(shellRoot, { attributes: true, attributeFilter: ["data-shell-mode", "data-input-mode", "data-orientation"] });

  const observer = new ResizeObserver(() => {
    if (resizeRef.current !== null) return;
    resizeRef.current = window.requestAnimationFrame(() => {
      resizeRef.current = null;
      resize();
    });
  });
  observer.observe(mount);

  const viewport = window.visualViewport;
  const onViewportChange = () => {
    if (resizeRef.current !== null) return;
    resizeRef.current = window.requestAnimationFrame(() => {
      resizeRef.current = null;
      resize();
    });
  };
  viewport?.addEventListener("resize", onViewportChange);
  viewport?.addEventListener("scroll", onViewportChange);

  // Palette-Wechsel des Dashboards übernehmen, ohne xterm, Sitzung oder
  // Transport neu aufzubauen: Es wird nur das Theme der laufenden Instanz
  // ersetzt und neu gezeichnet. Der Vergleich verhindert ein Neuzeichnen bei
  // fremden Inline-Styles auf <html> (z. B. der Terminal-Sidebar-Breite).
  let appliedTheme: ITheme | null = terminal.options.theme ?? null;
  const themes = new MutationObserver(() => {
    if (themeRefreshRef.current !== null) return;
    themeRefreshRef.current = window.setTimeout(() => {
      themeRefreshRef.current = null;
      const next = themeFromDashboard(mount);
      if (appliedTheme && terminalThemesEqual(appliedTheme, next)) return;
      appliedTheme = next;
      terminal.options.theme = next;
      if (terminal.rows > 0) terminal.refresh(0, terminal.rows - 1);
    }, 16);
  });
  themes.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme-preset"] });

  return () => {
    observer.disconnect();
    viewport?.removeEventListener("resize", onViewportChange);
    viewport?.removeEventListener("scroll", onViewportChange);
    themes.disconnect();
    shellObserver.disconnect();
    if (resizeRef.current !== null) window.cancelAnimationFrame(resizeRef.current);
    resizeRef.current = null;
    if (themeRefreshRef.current) window.clearTimeout(themeRefreshRef.current);
    themeRefreshRef.current = null;
  };
}
