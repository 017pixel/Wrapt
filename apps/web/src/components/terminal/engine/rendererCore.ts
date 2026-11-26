import type { ClientMessage, ServerMessage } from "../terminal-types";
import { discardTerminalReplay } from "../terminal-input";
import { createUuid } from "../terminal-utils";
import { terminalTransport } from "../transport/TerminalTransport";
import type { RendererCoreDeps, RendererRefs } from "./rendererTypes";

export interface RendererCore {
  syncMouseModes(): void;
  applyGeometry(cols: number, rows: number, owns: boolean): void;
  resync(): void;
  createSession(): void;
  subscribeNow(): void;
  handleMessage(message: ServerMessage): void;
  attach(): void;
  detach(): void;
}

/** Ein hängender Sync darf den Renderer nicht dauerhaft blockieren. Nach
 *  drei ausbleibenden Antworten endet der automatische Versuch; ein manueller
 *  Resync startet einen frischen Lauf. */
const SYNC_TIMEOUT_MS = 5_000;
const MAX_SYNC_ATTEMPTS = 3;

type PendingRequest = "create" | "subscribe" | "sync";

/** Baut den protokollnahen Sync-Kern eines Renderers. Alle Funktionen arbeiten
 *  über die übergebenen Refs — der Hook bleibt dadurch schlank und die
 *  Snapshot/Deltas-Logik ist isoliert testbar. */
export function createRendererCore(refs: RendererRefs, deps: RendererCoreDeps): RendererCore {
  const { terminalRef, fitRef, sessionRef, epochRef, sequenceRef, ownsGeometryRef, hasLiveStateRef, snapshotReplayRef, replayBufferRef, mouseTrackingRef, mouseEncodingRef, disposedRef, closedRef, createRetriesRef, subscriptionRef, cwdRef } = refs;
  let snapshotGeneration = 0;
  let createTimer: number | null = null;
  let syncTimer: number | null = null;
  let syncAttempts = 0;
  let pendingRequest: PendingRequest | null = null;
  let syncing = false;

  const clearSyncTimer = () => {
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    syncTimer = null;
  };

  const clearPendingSync = (resetAttempts = true) => {
    clearSyncTimer();
    pendingRequest = null;
    if (resetAttempts) syncAttempts = 0;
  };

  const finishSync = () => {
    clearPendingSync();
    syncing = false;
  };

  const failSync = () => {
    pendingRequest = null;
    syncing = false;
    const message = "Das Terminal antwortet nicht. Verbindung prüfen und erneut versuchen.";
    deps.setError(message);
    deps.setStatus("error");
    deps.reportMeta({ status: "error", error: message });
  };

  const armSyncTimeout = (request: PendingRequest) => {
    clearSyncTimer();
    pendingRequest = request;
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      if (disposedRef.current || !subscriptionRef.current || pendingRequest !== request) return;
      if (syncAttempts >= MAX_SYNC_ATTEMPTS) { failSync(); return; }
      syncAttempts += 1;
      if (request === "create") sendCreateNow();
      else if (request === "subscribe") sendSubscribeNow();
      else sendSyncNow();
    }, SYNC_TIMEOUT_MS);
  };

  /** Liest den tatsächlichen Maus-Modus direkt aus der xterm-Emulation. */
  const syncMouseModes = () => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    mouseTrackingRef.current = terminal.modes.mouseTrackingMode !== "none";
  };

  const applyGeometry = (cols: number, rows: number, owns: boolean) => {
    ownsGeometryRef.current = owns;
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (terminal.cols !== cols || terminal.rows !== rows) terminal.resize(cols, rows);
    if (owns) deps.fitAndReport();
  };

  /** Expliziter Sync-Lauf: erst nach Nutzeraktion auch einen auth-blockierten
   *  Socket neu öffnen, damit die Fehlermeldung nicht in einer Reconnect-Schleife
   *  endet. Ohne Session wird wie beim ersten Aufbau neu erstellt. */
  const resync = () => {
    const subscription = subscriptionRef.current;
    if (!subscription) { attach(); return; }
    subscription.retry();
    // Ein manueller Resync startet einen vollständigen neuen Sync-Lauf; sonst
    // würde der bereits erschöpfte Zähler nach 5 s sofort wieder aufgeben.
    syncAttempts = 0;
    deps.setError(null);
    if (!sessionRef.current) {
      if (closedRef.current) return;
      deps.setStatus("connecting");
      deps.reportMeta({ status: "connecting" });
      createSession();
      return;
    }
    if (syncing) return;
    syncing = true;
    deps.setStatus("connecting");
    deps.reportMeta({ status: "connecting" });
    // Ein volles Subscribe ist auch nach einem serverseitig abgebrochenen
    // Attach wirksam; ein reiner Sync hätte dort keinen Client mehr, an den
    // der neue Snapshot gehen könnte.
    if (!sendSubscribeNow()) syncing = false;
  };

  /** Erstellt beziehungsweise reaktiviert die Runtime (idempotent je Runtime-ID). */
  const createSession = () => {
    if (disposedRef.current || closedRef.current) return;
    sendCreateNow();
  };

  const sendCreateNow = () => {
    const terminal = terminalRef.current;
    const preferred = fitRef.current?.proposeDimensions();
    const sent = deps.sendMessage({
      type: "terminal.create",
      requestId: createUuid(),
      runtimeId: deps.instanceId,
      kind: deps.kind,
      mode: deps.mode,
      ...(deps.accountId ? { accountId: deps.accountId } : {}),
      ...(deps.projectId ? { projectId: deps.projectId } : {}),
      ...(deps.initialCwd ? { cwd: deps.initialCwd } : {}),
      cols: preferred?.cols ?? terminal?.cols ?? 120,
      rows: preferred?.rows ?? terminal?.rows ?? 30,
    });
    if (sent) armSyncTimeout("create");
    return sent;
  };

  /** Abonnieren mit optionalem Fast-Reconnect-Zustand (nur gesetzte Werte). */
  const subscribeNow = () => {
    sendSubscribeNow();
  };

  const sendSubscribeNow = () => {
    const preferred = fitRef.current?.proposeDimensions();
    const message: ClientMessage = {
      type: "terminal.subscribe",
      runtimeId: deps.instanceId,
      ...(preferred ? { cols: preferred.cols, rows: preferred.rows } : {}),
      ...(hasLiveStateRef.current ? { state: { epoch: epochRef.current, lastSequence: sequenceRef.current } } : {}),
    };
    const sent = deps.sendMessage(message);
    if (sent) armSyncTimeout("subscribe");
    return sent;
  };

  const sendSyncNow = () => {
    const sent = deps.sendMessage({ type: "terminal.sync", runtimeId: deps.instanceId, state: { epoch: epochRef.current, lastSequence: sequenceRef.current } });
    if (sent) armSyncTimeout("sync");
    return sent;
  };

  const handleMessage = (message: ServerMessage) => {
    const terminal = terminalRef.current;
    switch (message.type) {
      case "terminal.created": {
        clearPendingSync();
        closedRef.current = false;
        sessionRef.current = message.sessionId;
        cwdRef.current = message.cwd;
        deps.setCwd(message.cwd);
        subscribeNow();
        break;
      }
      case "terminal.snapshot": {
        if (!terminal || closedRef.current) return;
        finishSync();
        // Ein bestätigter Snapshot beendet den Wiederherstellungshinweis; ein
        // liegen gebliebener Banner würde sonst dauerhaft über dem Terminal stehen.
        deps.setRestartBanner(null);
        const buffer = terminal.buffer.active;
        const scrollOffset = hasLiveStateRef.current && epochRef.current === message.epoch && buffer?.type === "normal" ? buffer.baseY - buffer.viewportY : 0;
        sessionRef.current = message.sessionId;
        epochRef.current = message.epoch;
        sequenceRef.current = message.sequence;
        hasLiveStateRef.current = true;
        cwdRef.current = message.cwd;
        deps.setCwd(message.cwd);
        createRetriesRef.current = 0;
        deps.setError(null);
        deps.resetOutput();
        snapshotReplayRef.current = true;
        mouseEncodingRef.current = false;
        const generation = ++snapshotGeneration;
        // Das Snapshot-Raster zuerst unverändert wiedergeben. Ein Fit vor
        // write würde den alten Bildschirm in die neue Breite umbrechen.
        ownsGeometryRef.current = message.ownsGeometry;
        terminal.resize(message.cols, message.rows);
        // Der serialisierte Zustand enthält den exakten Bildschirm inklusive
        // Alternate Screen, Maus-Modi und Cursor — kein manuelles Raten mehr.
        const finishSnapshot = () => {
          if (disposedRef.current || closedRef.current || terminalRef.current !== terminal || epochRef.current !== message.epoch || snapshotGeneration !== generation) return;
          snapshotReplayRef.current = false;
          syncMouseModes();
          applyGeometry(message.cols, message.rows, message.ownsGeometry);
          if (scrollOffset > 0 && terminal.buffer.active.type === "normal") terminal.scrollToLine(Math.max(0, terminal.buffer.active.baseY - scrollOffset));
          deps.flushReplayBuffer();
          // "starting" ist ein laufender Neustart, kein beendetes Terminal.
          // "interrupted" bleibt ein reparierbarer Fehlerzustand und darf nicht
          // als endgültig geschlossen markiert werden.
          const status = message.status === "running" ? "connected"
            : message.status === "starting" ? "connecting"
            : message.status === "interrupted" ? "error"
            : "exited";
          if (status === "exited") closedRef.current = true;
          if (status === "error") {
            deps.setError("Das Terminal ist unterbrochen. Verbindung erneut herstellen.");
            deps.setStatus("error");
            deps.reportMeta({ status, error: "Das Terminal ist unterbrochen. Verbindung erneut herstellen." });
          } else {
            deps.setStatus(status);
            deps.reportMeta({ status });
          }
        };
        // Ein frisch gestartetes PTY kann noch ohne Ausgabe sein. xterm ruft
        // den Write-Callback für einen leeren String nicht zuverlässig auf;
        // der Renderer darf dann trotzdem nicht im Status „connecting“ hängen.
        // RIS wird zusammen mit dem Snapshot geordnet geparst. Ein direkter
        // reset() würde bereits eingereihte alte Writes nicht entfernen.
        terminal.write(`\x1bc${message.serialized}`, finishSnapshot);
        break;
      }
      case "terminal.deltas": {
        if (!terminal) return;
        // Deltas bestätigen den Sync; ein noch laufender Snapshot-Write ist
        // damit überholt und darf den frischen Zustand nicht mehr setzen.
        snapshotGeneration += 1;
        sessionRef.current = message.sessionId;
        epochRef.current = message.epoch;
        let output = "";
        for (const delta of message.deltas) {
          if (delta.sequence <= sequenceRef.current) continue;
          sequenceRef.current = delta.sequence;
          output += delta.data;
        }
        if (output) deps.queueOutput(output);
        hasLiveStateRef.current = true;
        finishSync();
        deps.setError(null);
        // Ein Fast Reconnect kann Deltas ohne Snapshot liefern. Dann darf die
        // Wiedergabe eines alten, invalidierten Snapshots nicht hängen bleiben.
        if (snapshotReplayRef.current) {
          snapshotReplayRef.current = false;
          deps.flushReplayBuffer();
        }
        if (!snapshotReplayRef.current) {
          deps.setStatus("connected");
          deps.reportMeta({ status: "connected" });
        }
        break;
      }
      case "terminal.output": {
        if (message.sequence <= sequenceRef.current) return; // alte Nachricht
        // Sequenzlücke: Zustand ist unsicher → Resync statt kaputt weiterlaufen.
        if (message.sequence > sequenceRef.current + 1) { resync(); return; }
        sequenceRef.current = message.sequence;
        deps.queueOutput(message.data);
        break;
      }
      case "terminal.geometry": applyGeometry(message.cols, message.rows, message.ownsGeometry); break;
      case "terminal.cwd": cwdRef.current = message.cwd; deps.setCwd(message.cwd); deps.reportMeta({}); break;
      case "terminal.cleared": {
        sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
        deps.resetOutput();
        mouseEncodingRef.current = false;
        terminal?.write("\x1bc", syncMouseModes);
        break;
      }
      case "terminal.exited": {
        finishSync();
        snapshotGeneration += 1;
        discardTerminalReplay(snapshotReplayRef, replayBufferRef, deps.setError);
        sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
        // Ein beendeter Prozess ist ein expliziter Endzustand. Ein späteres
        // SESSION_NOT_FOUND darf daraus keine neue Shell machen.
        closedRef.current = true;
        deps.setRestartBanner(null);
        deps.setStatus("exited");
        deps.reportMeta({ status: "exited" });
        break;
      }
      case "terminal.restarting": {
        finishSync();
        snapshotGeneration += 1;
        sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
        // Die Sitzung nimmt Eingaben während des Neustarts an. Gepufferte
        // Sequenzen gehen deshalb kontrolliert raus, statt auf einen alten
        // Snapshot zu warten.
        if (snapshotReplayRef.current) { snapshotReplayRef.current = false; deps.flushReplayBuffer(); }
        deps.setError(null);
        deps.setStatus("connecting");
        deps.reportMeta({ status: "connecting" });
        deps.setRestartBanner({ message: message.reason });
        break;
      }
      case "terminal.error": {
        if (message.code === "INPUT_NOT_SENT") { deps.setError(message.message); break; }
        clearPendingSync();
        syncing = false;
        if (message.code === "SESSION_ALREADY_CLOSED") {
          closedRef.current = true;
          deps.setError(null);
          deps.setStatus("exited");
          deps.reportMeta({ status: "exited" });
          break;
        }
        // Explizit beendete Sitzungen bleiben beendet: kein Fehler-Toast und
        // kein automatischer Neuaufbau, nur weil die Runtime verschwunden ist.
        if (message.code === "SESSION_NOT_FOUND" && closedRef.current) {
          deps.setError(null);
          break;
        }
        // Die Runtime wurde serverseitig entfernt: höchstens dreimal neu
        // erzeugen, danach sauberer Fehlerzustand. Explizit beendete Sitzungen
        // bleiben beendet und werden nie automatisch wiederbelebt.
        if (message.code === "SESSION_NOT_FOUND" && !closedRef.current && createRetriesRef.current < 3) {
          sessionRef.current = null;
          createRetriesRef.current += 1;
          if (createTimer === null) createTimer = window.setTimeout(() => { createTimer = null; if (!disposedRef.current && subscriptionRef.current) createSession(); }, 350);
          break;
        }
        deps.setError(message.message);
        deps.setStatus("error");
        deps.reportMeta({ status: "error", error: message.message });
        break;
      }
      default: break;
    }
  };

  const attach = () => {
    if (disposedRef.current || subscriptionRef.current) return;
    const subscription = terminalTransport.subscribe(deps.instanceId, sessionRef.current ? { sessionId: sessionRef.current } : {});
    subscriptionRef.current = subscription;
    subscription.onMessage(handleMessage);
    subscription.onStatus((connected, reason) => {
      // Jeder Verbindungswechsel invalidiert einen noch laufenden
      // Snapshot-Write. Sonst könnte ein verspäteter xterm-Callback den
      // frisch getrennten Zustand wieder auf "connected" setzen.
      snapshotGeneration += 1;
      if (!connected) {
        clearPendingSync();
        syncing = false;
        // Ungesendete Puffer einer getrennten Verbindung werden verworfen,
        // statt sie später unbemerkt in einen neuen Zustand zu schreiben.
        discardTerminalReplay(snapshotReplayRef, replayBufferRef, deps.setError);
        // 1008 ist eine abgelehnte Anmeldung, keine vorübergehende Störung.
        // Automatische Reconnects sind gesperrt; das muss klar benannt werden.
        if (reason === "auth") {
          const message = "Der Terminalzugriff wurde abgelehnt. Anmeldung prüfen und erneut verbinden.";
          deps.setError(message);
          deps.setStatus("error");
          deps.reportMeta({ status: "error", error: message });
          return;
        }
        deps.setStatus("disconnected");
        deps.reportMeta({ status: "disconnected" });
        return;
      }
      syncAttempts = 0;
      // `subscribe()` kann den Socket erst öffnen. In diesem Fall war der
      // erste create-Aufruf noch zu früh und wurde nicht gesendet. Nach dem
      // Open wird deshalb genau einmal der idempotente Create-/Resume-Flow
      // gestartet; bei einem späteren Reconnect wird die bestehende Runtime
      // direkt wieder abonniert und mit Epoch/Sequenz synchronisiert.
      if (sessionRef.current) subscribeNow();
      else if (!closedRef.current) createSession();
    });
  };

  const detach = () => {
    if (createTimer !== null) window.clearTimeout(createTimer);
    createTimer = null;
    clearPendingSync();
    syncing = false;
    subscriptionRef.current?.dispose();
    subscriptionRef.current = null;
  };

  return { syncMouseModes, applyGeometry, resync, createSession, subscribeNow, handleMessage, attach, detach };
}

export type { RendererCoreDeps, RendererRefs } from "./rendererTypes";
