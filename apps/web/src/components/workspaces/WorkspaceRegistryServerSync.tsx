import { useEffect, useRef } from "react";
import type { WorkspaceRegistrySnapshot as RegistryDocument } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { parseWorkspaceEntry, type WorkspaceEntry } from "./workspaceModel";
import { serializeWorkspaceSnapshot, type WorkspaceSnapshot } from "./workspaceStorage";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";

const SAVE_DELAY_MS = 800;
const POLL_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 3;

function localSnapshot(): WorkspaceSnapshot {
  const state = useWorkspaceRegistry.getState();
  return { entries: state.entries, changedAt: state.changedAt, deletedAt: state.deletedAt };
}

/** Serverdokument in das clientseitige Format überführen (gleiche Felder, eigene Typen). */
function clientSnapshot(document: RegistryDocument): WorkspaceSnapshot {
  return {
    entries: document.entries
      .map((entry) => parseWorkspaceEntry(entry))
      .filter((entry): entry is WorkspaceEntry => entry !== null),
    changedAt: { ...document.changedAt },
    deletedAt: { ...document.deletedAt },
  };
}

/** Clientstand in das Vertragsformat überführen (customName nur als `true`). */
function contractDocument(snapshot: WorkspaceSnapshot): RegistryDocument {
  return {
    entries: snapshot.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      ...(entry.customName ? { customName: true as const } : {}),
      url: entry.url,
      addedAt: entry.addedAt,
      lastUsedAt: entry.lastUsedAt,
    })),
    changedAt: { ...snapshot.changedAt },
    deletedAt: { ...snapshot.deletedAt },
  };
}

/**
 * Hält das Workspace-Register geräteübergreifend synchron.
 *
 * Der Browser bleibt offlinefähig (localStorage als Quelle), zusätzlich liegt
 * der Stand pro Benutzer auf jedem besuchten Server. Beim Wechsel zwischen
 * Servern nimmt der Hash den bekannten Stand mit, der Abgleich hier macht ihn
 * dauerhaft: Jedes Gerät sieht alle Server, egal wo sie hinzugefügt wurden.
 */
export function WorkspaceRegistryServerSync() {
  const initialized = useWorkspaceRegistry((state) => state.initialized);
  const entries = useWorkspaceRegistry((state) => state.entries);
  const changedAt = useWorkspaceRegistry((state) => state.changedAt);
  const deletedAt = useWorkspaceRegistry((state) => state.deletedAt);
  const switchingWorkspace = useWorkspaceRegistry((state) => state.switchingWorkspace);
  const serverRevision = useRef<number | null>(null);
  const lastServerJson = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const syncing = useRef(false);

  const load = async (): Promise<boolean> => {
    const state = useWorkspaceRegistry.getState();
    if (!state.initialized || !state.selfUrl) return false;
    try {
      const response = await apiClient.workspaceRegistry();
      const previous = serverRevision.current ?? -1;
      if (!response || response.revision < previous) return false;
      serverRevision.current = response.revision;
      const incoming = clientSnapshot(response.document);
      lastServerJson.current = serializeWorkspaceSnapshot(incoming);
      if (response.revision > previous) {
        useWorkspaceRegistry.getState().mergeStored(incoming);
      }
      return true;
    } catch {
      // Server bleibt Best-Effort: Das lokale Register funktioniert weiter,
      // der nächste Poll- oder Änderungslauf holt den Abgleich nach.
      return false;
    }
  };

  const push = async (): Promise<void> => {
    const state = useWorkspaceRegistry.getState();
    if (!state.initialized || !state.selfUrl || syncing.current) return;
    syncing.current = true;
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        if (serverRevision.current === null && !(await load())) return;
        const snapshot = localSnapshot();
        const json = serializeWorkspaceSnapshot(snapshot);
        if (json === lastServerJson.current) return;
        try {
          const response = await apiClient.saveWorkspaceRegistry({
            document: contractDocument(snapshot),
            expectedRevision: serverRevision.current ?? 0,
          });
          if (!response) return;
          serverRevision.current = response.revision;
          lastServerJson.current = serializeWorkspaceSnapshot(clientSnapshot(response.document));
          return;
        } catch (error) {
          if (!(error instanceof ApiClientError) || error.status !== 409) return;
          serverRevision.current = null;
        }
      }
    } finally {
      syncing.current = false;
    }
  };

  const pushRef = useRef(push);
  pushRef.current = push;
  const loadRef = useRef(load);
  loadRef.current = load;

  // Erstbefüllung nach der lokalen Initialisierung, danach bei Bedarf
  // zurückschreiben (etwa wenn der Server noch nichts kennt).
  useEffect(() => {
    if (!initialized) return;
    let active = true;
    void (async () => {
      if (!active) return;
      await loadRef.current();
      if (!active) return;
      await pushRef.current();
    })();
    return () => { active = false; };
     
  }, [initialized]);

  // Lokale Änderungen (hinzufügen, umbenennen, entfernen) gebündelt senden.
  useEffect(() => {
    if (!initialized) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void pushRef.current();
    }, SAVE_DELAY_MS);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
     
  }, [initialized, entries, changedAt, deletedAt]);

  // Vor dem Wechsel sofort sichern, damit der Zielserver den neuesten Stand
  // übernimmt, auch wenn das Debounce-Fenster noch liefe.
  useEffect(() => {
    if (!initialized || !switchingWorkspace) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    void pushRef.current();
     
  }, [initialized, switchingWorkspace]);

  // Fremde Geräte einbeziehen: regelmäßig und bei Rückkehr prüfen.
  useEffect(() => {
    if (!initialized) return;
    const poll = () => {
      if (globalThis.document.visibilityState === "hidden" || syncing.current) return;
      void (async () => {
        await loadRef.current();
        await pushRef.current();
      })();
    };
    const handle = window.setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => { if (globalThis.document.visibilityState === "visible") poll(); };
    window.addEventListener("focus", onVisible);
    globalThis.document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(handle);
      window.removeEventListener("focus", onVisible);
      globalThis.document.removeEventListener("visibilitychange", onVisible);
    };
     
  }, [initialized]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  return null;
}
