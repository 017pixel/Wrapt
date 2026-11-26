import { useEffect, useRef } from "react";
import type { TerminalWorkspaceOperation, TerminalWorkspaceV2 } from "@wrapt/contracts";
import { TERMINAL_WORKSPACE_OPERATION_LIMIT, terminalWorkspaceOperationSchema } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";
import { TerminalToastRegion } from "./TerminalToastRegion";
import { terminalTransport } from "./transport/TerminalTransport";
import { useSaveRetry } from "../../lib/saveRetry";

const SAVE_DELAY_MS = 400;
const POLL_INTERVAL_MS = 3_000;
const PENDING_KEY = "wrapt.terminals.pending.v2";
const QUARANTINE_KEY = "wrapt.terminals.pending.v2.quarantine";
const BROADCAST_CHANNEL = "wrapt.terminals.v2";
const MAX_REBASE_ROUNDS = 2;
const LOAD_RETRY_BASE_MS = 3_000;
const MAX_LOAD_RETRIES = 5;

interface PendingPayload { revision: number; operations: TerminalWorkspaceOperation[]; }

/** Beschädigte Offline-Ops werden nicht stillschweigend verworfen, sondern
 *  getrennt abgelegt. So bleiben sie für die Diagnose erhalten, blockieren
 *  aber weder Laden noch Speichern. */
function quarantineOperations(entries: unknown[]): void {
  if (entries.length === 0) return;
  try {
    const raw = window.localStorage.getItem(QUARANTINE_KEY);
    const previous = raw ? (JSON.parse(raw) as { entries?: unknown[] }).entries ?? [] : [];
    window.localStorage.setItem(QUARANTINE_KEY, JSON.stringify({
      at: new Date().toISOString(),
      entries: [...previous, ...entries].slice(-20),
    }));
  } catch { /* Die Diagnose darf den Start nie blockieren. */ }
}

/** Liest den Recovery-Puffer und validiert jede Operation einzeln. Nur gültige
 *  Ops werden erneut angewendet; der Rest wandert in die Quarantäne. */
function readPending(): PendingPayload | null {
  let raw: string | null;
  try { raw = window.localStorage.getItem(PENDING_KEY); } catch { return null; }
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { quarantineOperations([raw]); return null; }
  if (!parsed || typeof parsed !== "object") { quarantineOperations([parsed]); return null; }
  const revision = (parsed as { revision?: unknown }).revision;
  const candidates = (parsed as { operations?: unknown }).operations;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0 || !Array.isArray(candidates)) {
    quarantineOperations([parsed]);
    return null;
  }
  const operations: TerminalWorkspaceOperation[] = [];
  const invalid: unknown[] = [];
  for (const operation of candidates) {
    const result = terminalWorkspaceOperationSchema.safeParse(operation);
    if (result.success) operations.push(result.data);
    else invalid.push(operation);
  }
  quarantineOperations(invalid);
  return { revision, operations };
}

function writePending(payload: PendingPayload | null): void {
  try {
    if (payload === null) window.localStorage.removeItem(PENDING_KEY);
    else window.localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch { /* Server bleibt autoritativ. */ }
}

/** Lädt das Workspace-Dokument und migriert V1 einmalig serverseitig nach V2,
 *  sodass alle Aufrufer durchgehend ein V2-Dokument erhalten. */
async function loadWorkspaceV2(): Promise<{ document: TerminalWorkspaceV2; revision: number }> {
  const response = await apiClient.terminalWorkspace();
  if (response.document.version === 1) {
    const migrated = await apiClient.saveTerminalWorkspace({ document: response.document, expectedRevision: response.revision });
    if (migrated?.document.version === 2) return { document: migrated.document, revision: migrated.revision };
  }
  if (response.document.version === 2) return { document: response.document, revision: response.revision };
  throw new Error("Das Terminal-Layout konnte nicht migriert werden.");
}

export function TerminalWorkspaceSync() {
  const hydrated = useTerminalWorkspaceStore((state) => state.hydrated);
  const dirty = useTerminalWorkspaceStore((state) => state.dirty);
  const saving = useTerminalWorkspaceStore((state) => state.saving);
  const revision = useTerminalWorkspaceStore((state) => state.revision);
  const pendingOps = useTerminalWorkspaceStore((state) => state.pendingOps);
  const syncKick = useTerminalWorkspaceStore((state) => state.syncKick);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const { blocked: retryBlocked, retryAt, tick: retryTick, schedule: scheduleRetry, reset: resetRetry, trigger: retryNow, nextDelayMs } = useSaveRetry();
  // Eine Nutzeraktion („Erneut versuchen", Tab wieder sichtbar) setzt den
  // Backoff zurück und startet sofort einen neuen Lauf.
  useEffect(() => { retryNow(); }, [retryNow, syncKick]);

  // Jede neue Operation landet sofort im Recovery-Puffer. Der Debounce-Save
  // darf nicht das einzige Fenster sein, in dem ein Absturz den Stand verliert.
  useEffect(() => useTerminalWorkspaceStore.subscribe((state, previous) => {
    if (state.pendingOps === previous.pendingOps) return;
    writePending(state.pendingOps.length > 0 ? { revision: state.revision, operations: state.pendingOps } : null);
  }), []);

  useEffect(() => {
    if (hydrated) return;
    if (/\/(terminal|codex|claude)(\/|$)/.test(window.location.pathname)) terminalTransport.preconnect();
    let active = true;
    let retry: number | null = null;
    let failures = 0;
    const load = async () => {
      try {
        const response = await loadWorkspaceV2();
        if (!active) return;
        const pending = readPending();
        useTerminalWorkspaceStore.getState().initializeRemote(
          response.document,
          response.revision,
          pending ? pending.operations : [],
        );
      } catch (error: unknown) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Terminal-Layout konnte nicht geladen werden.";
        if (error instanceof ApiClientError && [401, 403].includes(error.status)) {
          useTerminalWorkspaceStore.getState().markSyncError(message);
          return;
        }
        failures += 1;
        if (failures > MAX_LOAD_RETRIES) {
          useTerminalWorkspaceStore.getState().markSyncError(`${message} Automatische Versuche gestoppt. Bitte „Erneut versuchen" wählen.`);
          return;
        }
        useTerminalWorkspaceStore.getState().markSyncError(`${message} Neuer Versuch in ${Math.round(Math.min(LOAD_RETRY_BASE_MS * 2 ** (failures - 1), 60_000) / 1_000)} s.`);
        retry = window.setTimeout(() => { retry = null; void load(); }, Math.min(LOAD_RETRY_BASE_MS * 2 ** (failures - 1), 60_000));
      }
    };
    void load();
    return () => { active = false; if (retry !== null) window.clearTimeout(retry); };
    // Ein manueller Kick startet auch den initialen Load neu; nach der
    // Hydration übernimmt der normale Save-/Poll-Pfad.
  }, [hydrated, syncKick]);

  useEffect(() => {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ document?: unknown; revision?: unknown }>) => {
      const state = useTerminalWorkspaceStore.getState();
      if (state.dirty || state.saving || !state.hydrated) return;
      if (typeof event.data?.revision === "number" && typeof event.data.document === "object" && event.data.document !== null) {
        const remote = event.data.document as Parameters<typeof state.applyRemote>[0];
        if (event.data.revision > state.revision) state.applyRemote(remote, event.data.revision);
      }
    };
    return () => { channel.close(); channelRef.current = null; };
  }, []);

  useEffect(() => {
    if (!hydrated || !dirty || saving || pendingOps.length === 0) return;
    // Kein Request während eines laufenden Backoffs oder in einem
    // versteckten Tab. Timer und Sichtbarkeit stoßen den Lauf erneut an.
    if (retryBlocked || retryAt > Date.now()) return;
    if (globalThis.document.visibilityState === "hidden") return;
    writePending({ revision, operations: pendingOps });
    // Der Recoverypuffer enthält weiterhin alle Operationen. Nur der
    // bestätigte Präfix wird entfernt, weitere Batches folgen geordnet.
    const snapshot = { revision, operations: pendingOps.slice(0, TERMINAL_WORKSPACE_OPERATION_LIMIT) };
    // Neue Runtime erst nach dem Server-Ack starten: Beim Schließen eines
    // frischen Browserkontexts muss ihr Pane bereits serverseitig existieren.
    const delay = pendingOps.some((operation) => operation.type === "createEntry") ? 0 : SAVE_DELAY_MS;
    const handle = window.setTimeout(() => {
      useTerminalWorkspaceStore.getState().markSaving(true);
      void (async () => {
        let latest = snapshot;
        for (let round = 0; round <= MAX_REBASE_ROUNDS; round += 1) {
          try {
            const response = await apiClient.terminalWorkspaceOps({ expectedRevision: latest.revision, operations: latest.operations });
            // Ohne Serverantwort bleibt der Puffer schmutzig; der Save darf
            // nicht als "läuft noch" hängen bleiben und muss sichtbar scheitern.
            if (!response) {
              useTerminalWorkspaceStore.getState().markSyncError(retryMessage("Das Terminal-Layout konnte nicht gespeichert werden.", scheduleRetry, nextDelayMs));
              return;
            }
            if (response.document.version !== 2) {
              useTerminalWorkspaceStore.getState().markSyncError("Das Terminal-Layout konnte nicht gespeichert werden.");
              return;
            }
            useTerminalWorkspaceStore.getState().reconcileSaved(response.document, response.revision, latest.operations);
            resetRetry();
            const current = useTerminalWorkspaceStore.getState();
            if (current.pendingOps.length === 0) writePending(null);
            else writePending({ revision: current.revision, operations: current.pendingOps });
            channelRef.current?.postMessage({ document: response.document, revision: response.revision });
            return;
          } catch (error: unknown) {
            if (error instanceof ApiClientError && error.status === 409) {
              const remote = await loadWorkspaceV2().catch(() => null);
              if (!remote) {
                useTerminalWorkspaceStore.getState().markSyncError(retryMessage("Terminal-Layout konnte nicht gespeichert werden.", scheduleRetry, nextDelayMs));
                return;
              }
              // Rebase: lokale Ops auf den neuesten Serverstand anwenden und
              // erneut senden. `applyRemote` schützt absichtlich schmutzige
              // Dokumente, deshalb braucht der Konfliktpfad eine eigene
              // Methode, die die lokalen Operationen sichtbar erhält.
              const current = useTerminalWorkspaceStore.getState();
              const operations = current.pendingOps.length > 0 ? current.pendingOps : latest.operations;
              current.rebaseRemote(remote.document, remote.revision, operations);
              current.markSaving(true);
              latest = { revision: remote.revision, operations: operations.slice(0, TERMINAL_WORKSPACE_OPERATION_LIMIT) };
              continue;
            }
            useTerminalWorkspaceStore.getState().markSyncError(retryMessage(
              error instanceof Error ? error.message : "Terminal-Layout konnte nicht gespeichert werden.",
              scheduleRetry,
              nextDelayMs,
            ));
            return;
          }
        }
        // Bei ungewöhnlich hoher Konkurrenz bleibt der lokale Puffer erhalten.
        // Der Backoff verhindert, dass derselbe Konflikt sofort erneut läuft.
        useTerminalWorkspaceStore.getState().markSyncError(retryMessage(
          "Das Terminal-Layout wurde parallel zu oft geändert.",
          scheduleRetry,
          nextDelayMs,
        ));
      })();
    }, delay);
    return () => window.clearTimeout(handle);
  }, [dirty, hydrated, nextDelayMs, pendingOps, resetRetry, retryAt, retryBlocked, retryTick, revision, saving, scheduleRetry, syncKick]);

  // queueOps löscht den sichtbaren Fehler. Ist der Backoff bereits
  // ausgeschöpft, würde der Save-Effekt danach still zurückkehren und der
  // Nutzer sähe weder Fehler noch Retry. Der blockierte Zustand bleibt deshalb
  // sichtbar, bis der Puffer bestätigt oder manuell erneut versucht wird.
  useEffect(() => {
    if (!retryBlocked || !dirty) return;
    const state = useTerminalWorkspaceStore.getState();
    if (state.syncError) return;
    state.markSyncError("Terminal-Änderungen sind noch nicht gespeichert. Automatische Versuche gestoppt. Bitte „Erneut versuchen“ wählen.");
  }, [dirty, pendingOps, retryBlocked]);

  useEffect(() => {
    const poll = () => {
      if (globalThis.document.visibilityState === "hidden") return;
      const state = useTerminalWorkspaceStore.getState();
      if (!state.hydrated || state.dirty || state.saving) return;
      void loadWorkspaceV2().then((response) => {
        if (response.revision > useTerminalWorkspaceStore.getState().revision) {
          useTerminalWorkspaceStore.getState().applyRemote(response.document, response.revision);
          channelRef.current?.postMessage({ document: response.document, revision: response.revision });
        }
      }).catch(() => { /* later poll retries */ });
    };
    const handle = window.setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (globalThis.document.visibilityState !== "visible") return;
      poll();
      if (useTerminalWorkspaceStore.getState().dirty) useTerminalWorkspaceStore.getState().kickSync();
    };
    window.addEventListener("focus", onVisible);
    globalThis.document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(handle);
      window.removeEventListener("focus", onVisible);
      globalThis.document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <TerminalToastRegion />;
}

/** Formuliert die Fehlermeldung passend zum Backoff-Zustand. */
function retryMessage(message: string, schedule: () => boolean, nextDelayMs: () => number): string {
  if (!schedule()) return `${message} Automatische Versuche gestoppt. Bitte „Erneut versuchen" wählen.`;
  return `${message} Neuer Versuch in ${Math.round(nextDelayMs() / 1_000)} s.`;
}
