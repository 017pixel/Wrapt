import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PreviewDiagnosticEvent,
  PreviewLocalStorageEntry,
  PreviewLocalStorageState,
  PreviewSessionResponse,
} from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { generateId } from "../../lib/id";
import { snapshotBytes, snapshotHash } from "../../lib/previewStorageSnapshot";
import type { PreviewBridgeClient } from "../../lib/previewBridgeClient";
import type { PreviewRuntimeAssignment } from "./usePreviewRuntimeSession";

interface UsePreviewRuntimeStorageInput {
  bridge: PreviewBridgeClient;
  routeActive: boolean;
  storageProfileId: string | null;
  session: PreviewSessionResponse | null;
  previewNodeId: string | null;
  assignmentRef: { current: PreviewRuntimeAssignment | null };
  queueEventState: (events: PreviewDiagnosticEvent[], droppedCount?: number) => void;
}

export function usePreviewRuntimeStorage(input: UsePreviewRuntimeStorageInput) {
  const { bridge, routeActive, storageProfileId, session, previewNodeId, assignmentRef, queueEventState } = input;
  const [storageState, setStorageState] = useState<PreviewLocalStorageState | null>(null);
  const [storageConflict, setStorageConflict] = useState<string | null>(null);
  const storageStateRef = useRef<PreviewLocalStorageState | null>(null);
  const storageWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const storageConflictBlockedRef = useRef(false);
  const conflictedEntriesRef = useRef<PreviewLocalStorageEntry[] | null>(null);

  const loadStorageState = useCallback(async () => {
    if (!storageProfileId) return;
    try {
      const next = await apiClient.previewStorageState(storageProfileId) ?? null;
      storageStateRef.current = next;
      setStorageState(next);
      return next;
    } catch {
      storageStateRef.current = null;
      setStorageState(null);
      return null;
    }
  }, [storageProfileId]);

  useEffect(() => {
    if (!routeActive || !storageProfileId || !session?.capabilities.includes("storage-snapshot")) return;
    void loadStorageState();
  }, [routeActive, session, storageProfileId, loadStorageState]);

  const persistSnapshot = useCallback((entries: PreviewLocalStorageEntry[]) => {
    storageWriteQueueRef.current = storageWriteQueueRef.current.then(async () => {
      const currentState = storageStateRef.current;
      if (!storageProfileId || !currentState?.enabled || storageConflictBlockedRef.current) return;
      const hash = snapshotHash(entries);
      if (hash === currentState.current?.hash) return;
      try {
        const next = await apiClient.savePreviewStorageSnapshot(storageProfileId, {
          expectedRevision: currentState.current?.revision ?? null,
          hash,
          bridgeVersion: session?.bridgeVersion ?? "v1",
          entries,
        }) ?? null;
        storageStateRef.current = next;
        setStorageState(next);
        setStorageConflict(null);
      } catch (reason) {
        if (reason instanceof ApiClientError && reason.status === 409) {
          storageConflictBlockedRef.current = true;
          conflictedEntriesRef.current = entries;
          setStorageConflict("Der Snapshot wurde auf einem anderen Gerät geändert. Bitte wähle, welcher Stand gelten soll.");
          await loadStorageState();
          return;
        }
        const failure: PreviewDiagnosticEvent = {
          id: generateId(),
          at: new Date().toISOString(),
          source: "system",
          category: "storage",
          severity: "warn",
          completeness: "complete",
          previewNodeId,
          sessionId: session?.id ?? null,
          slotId: assignmentRef.current?.slotId ?? null,
          routingRevision: session?.routingRevision ?? null,
          bridgeSessionId: bridge.sessionId,
          epoch: 0,
          sequence: 0,
          route: null,
          message: reason instanceof Error ? reason.message : "Der Storage-Snapshot konnte nicht gespeichert werden.",
          metadata: { keys: entries.length, bytes: snapshotBytes(entries) },
        };
        queueEventState([failure]);
      }
    }).catch(() => undefined);
  }, [
    assignmentRef,
    bridge,
    previewNodeId,
    queueEventState,
    session?.bridgeVersion,
    session?.id,
    session?.routingRevision,
    storageProfileId,
    loadStorageState,
  ]);

  useEffect(() => {
    bridge.setStorageHandler(routeActive && storageState?.enabled ? persistSnapshot : null);
  }, [bridge, routeActive, persistSnapshot, storageState]);

  const toggleStorage = useCallback(async (enabled: boolean) => {
    if (!storageProfileId) return;
    const next = await apiClient.setPreviewStorageEnabled(storageProfileId, enabled) ?? null;
    storageStateRef.current = next;
    setStorageState(next);
  }, [storageProfileId]);

  const restoreStorage = useCallback(async (revision: number) => {
    if (!storageProfileId) return;
    const restored = await apiClient.restorePreviewStorage(storageProfileId, revision);
    if (!restored) return;
    const written = await bridge.restoreStorage(restored.entries);
    storageConflictBlockedRef.current = false;
    conflictedEntriesRef.current = null;
    setStorageConflict(written === null ? "Der Zustand konnte im iframe nicht geschrieben werden." : null);
    await loadStorageState();
  }, [bridge, storageProfileId, loadStorageState]);

  const keepLocal = useCallback(() => {
    const entries = conflictedEntriesRef.current;
    storageConflictBlockedRef.current = false;
    conflictedEntriesRef.current = null;
    setStorageConflict(null);
    if (entries) persistSnapshot(entries);
  }, [persistSnapshot]);

  return { storageState, storageConflict, loadStorageState, persistSnapshot, toggleStorage, restoreStorage, keepLocal };
}
