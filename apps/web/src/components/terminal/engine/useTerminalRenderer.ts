import { terminalCwdFromOsc } from "@wrapt/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { writeClipboardText } from "../../../lib/clipboard";
import { applyTerminalRenderScale, attachTerminalAppearance, createTerminalScaleResizeScheduler } from "../terminal-appearance";
import { attachTerminalInput } from "../terminal-input";
import { useTerminalOutput } from "../useTerminalOutput";
import { isCompactTerminal, mouseWheelSequence, terminalFontSizeForRenderScale } from "../terminal-utils";
import { themeFromDashboard } from "../terminal-theme";
import type { ClientMessage, TerminalMeta, TerminalStatus } from "../terminal-types";
import type { TerminalSubscription } from "../transport/TerminalTransport";
import { createRendererCore } from "./rendererCore";
import type { TerminalRenderer, TerminalRendererOptions } from "./rendererTypes";
import { useTerminalSessionActions } from "./useTerminalSessionActions";
import { useOrbitTerminalActivity } from "../../orbit/useOrbitTerminalActivity";
import { publishTerminalView, removeTerminalView } from "./terminalViewRegistry";

/**
 * Renderer-Engine V2: Eine xterm-Instanz pro sichtbarem Pane, verbunden über
 * den gemeinsamen multiplexten Socket. Der Server hält den autoritativen
 * Terminalzustand (Headless-xterm + Sequenz + Journal); dieser Renderer
 * synchronisiert per Snapshot/Deltas (siehe rendererCore) und beendet die
 * Subscription, sobald er unsichtbar wird — kein ANSI-Parsing im Hintergrund.
 */
export function useTerminalRenderer(options: TerminalRendererOptions): TerminalRenderer {
  const { instanceId, kind, projectId, initialCwd, mode, accountId, focused, renderScale, onMetaChange } = options;

  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(options.active);
  const outputActiveRef = useRef(options.active);
  const focusedRef = useRef(focused);
  const kindRef = useRef(kind);
  const sessionRef = useRef<string | null>(options.sessionId ?? null);
  const epochRef = useRef(0);
  const sequenceRef = useRef(0);
  const ownsGeometryRef = useRef(false);
  const hasLiveStateRef = useRef(false);
  const snapshotReplayRef = useRef(false);
  const replayBufferRef = useRef<string[]>([]);
  const mouseTrackingRef = useRef(false);
  const mouseEncodingRef = useRef(false);
  const disposedRef = useRef(false);
  const closedRef = useRef(false);
  const createRetriesRef = useRef(0);
  const subscriptionRef = useRef<TerminalSubscription | null>(null);
  const revealFrameRef = useRef<number | null>(null);
  const scaleResizeSchedulerRef = useRef<ReturnType<typeof createTerminalScaleResizeScheduler> | null>(null);
  const renderScaleRef = useRef(renderScale);
  const cwdRef = useRef("–");
  const metaCallbackRef = useRef(onMetaChange);
  metaCallbackRef.current = onMetaChange;
  renderScaleRef.current = renderScale;

  // Beim Antippen wird der Ref im PointerDown-Handler sofort gesetzt. Ein
  // Render darf diesen Fokus nicht mit dem alten Parent-Prop überschreiben.
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  const [status, setStatusState] = useState<TerminalStatus>("connecting");
  // Auch entfernte neue Tools starten wie bisher. Erst nach dem ersten
  // vollständigen Sync darf ihr Browser-Abo ruhen, niemals die Runtime.
  const active = useOrbitTerminalActivity(mountRef, options.active,
    status !== "connecting" && (hasLiveStateRef.current || status === "error" || status === "exited"));
  activeRef.current = active;
  const subscribed = active || options.preload === true;
  outputActiveRef.current = subscribed;
  const [cwd, setCwdState] = useState("–");
  const [error, setErrorState] = useState<string | null>(null);
  const [restartBanner, setRestartBannerState] = useState<{ message: string } | null>(null);
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);

  const setStatus = useCallback((next: TerminalStatus) => setStatusState(next), []);
  const statusRef = useRef<TerminalStatus>(status);
  const errorRef = useRef<string | null>(error);
  statusRef.current = status;
  errorRef.current = error;
  cwdRef.current = cwd;

  const sendMessage = useCallback((message: ClientMessage): boolean => {
    return subscriptionRef.current?.send(message) ?? false;
  }, []);

  const output = useTerminalOutput({
    terminalRef, activeRef: outputActiveRef, sessionRef, replayBufferRef,
    send: (message) => sendMessage(message as ClientMessage),
    setError: setErrorState,
  });
  const { lastCommand, flushOutput, queueOutput, resetOutput, flushReplayBuffer, rememberTyping } = output;

  const reportMeta = useCallback((patch: Partial<TerminalMeta>) => {
    metaCallbackRef.current?.({
      status: statusRef.current,
      cwd: cwdRef.current,
      error: errorRef.current,
      cols: terminalRef.current?.cols ?? 0,
      rows: terminalRef.current?.rows ?? 0,
      ...patch,
    });
  }, []);

  const reportSize = useCallback((cols: number, rows: number) => {
    const sessionId = sessionRef.current;
    if (sessionId) sendMessage({ type: "terminal.resize", sessionId, cols, rows });
  }, [sendMessage]);

  const fitAndReport = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal || !fitRef.current || !activeRef.current) return;
    try {
      // Orbit-Spiegel brauchen ein eigenes sichtbares Raster. Die PTY-Größe
      // auf dem Server darf weiterhin nur der Geometrie-Eigentümer ändern.
      if (ownsGeometryRef.current || mountRef.current?.closest(".orbit-flow")) {
        fitRef.current.fit();
        if (ownsGeometryRef.current) reportSize(terminal.cols, terminal.rows);
      } else {
        const dims = fitRef.current.proposeDimensions();
        if (dims) reportSize(dims.cols, dims.rows);
      }
    } catch { /* Versteckte Container haben kurz keine messbare Größe. */ }
  }, [reportSize]);

  const revealTerminal = useCallback(() => {
    if (revealFrameRef.current !== null) window.cancelAnimationFrame(revealFrameRef.current);
    revealFrameRef.current = window.requestAnimationFrame(() => {
      revealFrameRef.current = null;
      fitAndReport();
      const terminal = terminalRef.current;
      if (activeRef.current && terminal && terminal.rows > 0) {
        // Beim Parken kann xterm den DOM-Scrollbereich mit einer veralteten
        // Geometrie zurücklassen. Die Buffer-Position ist weiterhin die
        // autoritative Position und synchronisiert den Viewport vor dem
        // Neuzeichnen wieder mit dem aktuell sichtbaren Pane.
        terminal.scrollToLine(terminal.buffer.active.viewportY);
        terminal.refresh(0, terminal.rows - 1);
      }
    });
  }, [fitAndReport]);

  const refs = {
    terminalRef, fitRef, activeRef, kindRef, sessionRef, epochRef, sequenceRef,
    ownsGeometryRef, hasLiveStateRef, snapshotReplayRef, replayBufferRef,
    mouseTrackingRef, mouseEncodingRef, disposedRef, closedRef, createRetriesRef,
    subscriptionRef, cwdRef,
  };

  const [core] = useState(() => createRendererCore(refs, {
    instanceId, kind, projectId, initialCwd, mode, accountId, sendMessage,
    setStatus, setCwd: setCwdState, setError: setErrorState, setRestartBanner: setRestartBannerState,
    reportMeta, queueOutput, resetOutput, flushReplayBuffer, fitAndReport,
  }));
  const { attach, detach, resync } = core;

  // xterm-Lifecycle: erst erzeugen, wenn der Container wirklich sichtbar ist.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    disposedRef.current = false;
    const compact = isCompactTerminal(mount);
    const terminal = new Terminal({
      // Bei reduzierter Bewegung bleibt der Cursor stehen statt zu blinken.
      cursorBlink: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches !== true,
      cursorStyle: "block",
      cursorInactiveStyle: "outline",
      convertEol: false,
      fontSize: terminalFontSizeForRenderScale(renderScale, compact),
      lineHeight: 1,
      letterSpacing: 0,
      customGlyphs: true,
      // Auf macOS wählt Alt+Ziehen wie im nativen Terminal Text aus, auch
      // während die Anwendung Mausereignisse verfolgt.
      macOptionClickForcesSelection: true,
      scrollback: 10_000,
      scrollSensitivity: 1,
      smoothScrollDuration: 0,
      // buffer/modes werden für den Maus-Modus gelesen (autoritative Quelle).
      allowProposedApi: true,
      fontFamily: '"SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, monospace',
      theme: themeFromDashboard(mount),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mount);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const cwdHandlers = ([7, 9] as const).map((identifier) => terminal.parser.registerOscHandler(identifier, (value) => {
      const next = terminalCwdFromOsc(identifier, value);
      if (next) { cwdRef.current = next; setCwdState(next); reportMeta({}); }
      return next !== null;
    }));
    const mouseHandlers = (["h", "l"] as const).map((final) => terminal.parser.registerCsiHandler({ prefix: "?", final }, (params) => {
      if (params.includes(1006)) mouseEncodingRef.current = final === "h";
      return false;
    }));
    const parsedHandler = terminal.onWriteParsed(() => {
      mouseTrackingRef.current = terminal.modes.mouseTrackingMode !== "none";
      publishTerminalView(instanceId, terminal, statusRef.current);
    });

    const pasteIntoTerminal = (text: string) => {
      terminal.paste(text);
      setErrorState(null);
      window.setTimeout(() => terminal.focus(), 0);
    };
    const copySelection = () => {
      const selection = terminal.getSelection();
      if (!selection) { setErrorState("Wähle zuerst Text im Terminal aus."); return; }
      void writeClipboardText(selection)
        .catch((copyError) => setErrorState(copyError instanceof Error ? copyError.message : "Kopieren wurde vom Browser nicht erlaubt."));
    };
    const receivePastedText = (text: string) => {
      if (text.length > 10_000) { setPendingPaste(text); return; }
      pasteIntoTerminal(text);
    };
    const scrollByLines = (lines: number) => {
      if (!terminal || lines === 0) return;
      if (terminal.buffer.active.type !== "alternate") { terminal.scrollLines(lines); return; }
      const sessionId = sessionRef.current;
      if (!sessionId) return;
      const steps = Math.min(Math.abs(lines), 12);
      if (terminal.modes.mouseTrackingMode !== "none") {
        const sequence = mouseWheelSequence(lines < 0 ? "up" : "down", mouseEncodingRef.current);
        sendMessage({ type: "terminal.input", sessionId, data: sequence.repeat(steps) });
        return;
      }
      if (kindRef.current === "shell") {
        const sequence = lines < 0 ? "\x1b[A" : "\x1b[B";
        sendMessage({ type: "terminal.input", sessionId, data: sequence.repeat(steps) });
      }
    };
    const disposeInput = attachTerminalInput(terminal, mount, {
      send: (message) => sendMessage(message as ClientMessage),
      setError: setErrorState,
      sessionRef, snapshotReplayRef, replayBufferRef, mouseTrackingRef, kindRef, terminalRef, focusedRef,
      rememberTyping, copySelection, receivePastedText, scrollByLines,
    });
    const disposeAppearance = attachTerminalAppearance(terminal, mount, {
      disposedRef, terminalRef,
      compactRef: { current: compact },
      renderScaleRef,
      resizeRef: { current: null },
      themeRefreshRef: { current: null },
      resize: fitAndReport,
    });
    const scaleResizeScheduler = createTerminalScaleResizeScheduler(fitAndReport);
    scaleResizeSchedulerRef.current = scaleResizeScheduler;

    const onVisibility = () => { if (document.visibilityState === "visible") revealTerminal(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", revealTerminal);
    window.addEventListener("resize", fitAndReport);

    return () => {
      disposedRef.current = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", revealTerminal);
      window.removeEventListener("resize", fitAndReport);
      if (revealFrameRef.current !== null) window.cancelAnimationFrame(revealFrameRef.current);
      scaleResizeScheduler.cancel();
      if (scaleResizeSchedulerRef.current === scaleResizeScheduler) scaleResizeSchedulerRef.current = null;
      disposeInput();
      disposeAppearance();
      for (const handler of cwdHandlers) handler.dispose();
      for (const handler of mouseHandlers) handler.dispose();
      parsedHandler.dispose();
      removeTerminalView(instanceId, terminal);
      detach();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sichtbarkeit steuert die Subscription: Sichtbar → synchronisieren,
  // unsichtbar → detach (kein Parsen im Hintergrund).
  useEffect(() => {
    if (subscribed) {
      flushOutput(true);
      attach();
      revealTerminal();
    }
    else detach();
    return () => detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribed]);

  useEffect(() => { if (active) revealTerminal(); }, [active, revealTerminal]);
  useEffect(() => {
    if (active && focused && !isCompactTerminal(mountRef.current)) terminalRef.current?.focus();
  }, [active, focused]);

  useEffect(() => {
    // Entfernte Panes messen während einer Canvasbewegung keine neuen
    // Schriftmetriken. Bei Rückkehr gelten sofort Zoom und Raster von jetzt.
    if (!active) return;
    const terminal = terminalRef.current;
    if (!terminal || !applyTerminalRenderScale(terminal, renderScale, isCompactTerminal(mountRef.current))) return;
    const scheduler = scaleResizeSchedulerRef.current;
    if (scheduler) scheduler.schedule();
    else fitAndReport();
  }, [active, fitAndReport, renderScale]);

  const actions = useTerminalSessionActions({ refs, focusedRef, instanceId, core, sendMessage, setErrorState, setStatus, setPendingPaste, reportMeta });

  useEffect(() => {
    reportMeta({});
    if (terminalRef.current) publishTerminalView(instanceId, terminalRef.current, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cwd, error]);

  const terminalIsDead = status === "exited" || status === "error";

  return {
    status, cwd, error, restartBanner, lastCommand, terminalIsDead, pendingPaste,
    ...actions, resync,
    setError: setErrorState,
    setRestartBanner: setRestartBannerState,
    mountRef,
  };
}
