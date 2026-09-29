import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PreviewDiagnosticEvent, PreviewSessionResponse } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { previewSlotUrl } from "../../lib/previewTargets";
import { PreviewBridgeClient, type BridgeStatus } from "../../lib/previewBridgeClient";
import { generateId } from "../../lib/id";
import { withPreviewSlotRecovery } from "../../lib/previewSlotRecovery";

export interface PreviewRuntimeAssignment {
  slotId: number;
  targetPort: number;
  isolate: boolean;
  publicUrl: string;
  requestFingerprint: string;
}

export interface UsePreviewRuntimeSessionInput {
  routeActive: boolean;
  targetPort: number;
  path: string;
  requestedSlotId: number | null;
  isolate: boolean;
  storageProfileId: string | null;
  previewNodeId: string | null;
  projectId: string | null;
  sessionKey?: string;
  visible: boolean;
  reloadKey: number;
  onSlotAssigned?: (slotId: number, url: string) => void;
}

export function usePreviewRuntimeSession(input: UsePreviewRuntimeSessionInput) {
  const routeActive = input.routeActive;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [session, setSession] = useState<PreviewSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [runtimeReloadKey, setRuntimeReloadKey] = useState(0);
  const [events, setEvents] = useState<PreviewDiagnosticEvent[]>([]);
  const [dropped, setDropped] = useState(0);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ connected: false, version: null, href: null, unavailable: false });
  const eventBufferRef = useRef<PreviewDiagnosticEvent[]>([]);
  const eventDroppedRef = useRef(0);
  const eventFlushRef = useRef<number | null>(null);
  const routeActiveRef = useRef(routeActive);
  const generatedSessionKey = useRef(input.sessionKey ?? `preview:${generateId()}`);
  const effectiveSessionKey = input.sessionKey ?? generatedSessionKey.current;
  const idempotencyRequestRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const assignmentRef = useRef<PreviewRuntimeAssignment | null>(null);
  const onSlotAssignedRef = useRef(input.onSlotAssigned);
  onSlotAssignedRef.current = input.onSlotAssigned;

  const flushEventState = useCallback(() => {
    if (eventFlushRef.current !== null) {
      window.clearTimeout(eventFlushRef.current);
      eventFlushRef.current = null;
    }
    setEvents(eventBufferRef.current);
    setDropped(eventDroppedRef.current);
  }, []);
  const queueEventState = useCallback((incoming: PreviewDiagnosticEvent[], droppedCount?: number) => {
    if (!routeActiveRef.current) return;
    if (incoming.length > 0) eventBufferRef.current = [...eventBufferRef.current, ...incoming].slice(-500);
    if (droppedCount !== undefined) eventDroppedRef.current = droppedCount;
    if (eventFlushRef.current === null) eventFlushRef.current = window.setTimeout(flushEventState, 75);
  }, [flushEventState]);

  useEffect(() => {
    routeActiveRef.current = routeActive;
    if (routeActive) flushEventState();
  }, [flushEventState, routeActive]);

  const bridge = useMemo(() => new PreviewBridgeClient({
    onStatus: setBridgeStatus,
    onDiagnostics: queueEventState,
  }), [queueEventState]);
  useEffect(() => () => bridge.dispose(), [bridge]);
  useEffect(() => () => {
    if (eventFlushRef.current !== null) window.clearTimeout(eventFlushRef.current);
  }, []);

  useEffect(() => {
    if (!routeActive || !input.visible) return;
    const requestFingerprint = JSON.stringify({
      sessionKey: effectiveSessionKey,
      projectId: input.projectId,
      targetPort: input.targetPort,
      isolate: input.isolate,
      storageProfileId: input.storageProfileId,
    });
    const current = assignmentRef.current;
    if (current && current.requestFingerprint === requestFingerprint
      && (input.requestedSlotId === null || input.requestedSlotId === current.slotId)) {
      setUrl(previewSlotUrl(current.publicUrl, input.path));
      return;
    }
    if (idempotencyRequestRef.current?.fingerprint !== requestFingerprint) {
      idempotencyRequestRef.current = { fingerprint: requestFingerprint, key: generateId() };
    }
    const idempotencyKey = idempotencyRequestRef.current.key;
    let active = true;
    setError(null);
    const open = (slotId: number | null) => apiClient.openPreviewSession({
      sessionKey: effectiveSessionKey,
      projectId: input.projectId,
      primaryPort: input.targetPort,
      primaryProtocol: "http",
      isolate: input.isolate,
      storageProfileId: input.storageProfileId,
      idempotencyKey,
      ...(slotId === null ? {} : { requestedSlotId: slotId }),
    });
    const openWithRecovery = async () => {
      try {
        return await open(input.requestedSlotId);
      } catch (reason) {
        if (input.requestedSlotId !== null && reason instanceof ApiClientError && reason.code === "PREVIEW_SLOT_CHANGED") {
          return withPreviewSlotRecovery(() => open(null));
        }
        if (!(reason instanceof ApiClientError) || reason.code !== "PREVIEW_SLOTS_EXHAUSTED") throw reason;
        return withPreviewSlotRecovery(() => open(null));
      }
    };
    void openWithRecovery().then((response) => {
      if (!active || !response) return;
      const primary = response.bindings.find((candidate) => candidate.role === "primary");
      if (!primary) throw new Error("Der zugewiesene Hauptdienst fehlt in der Serverantwort.");
      const nextUrl = previewSlotUrl(primary.publicUrl, input.path);
      assignmentRef.current = {
        slotId: primary.slotId,
        targetPort: input.targetPort,
        isolate: input.isolate,
        publicUrl: primary.publicUrl,
        requestFingerprint,
      };
      setSession(response);
      setLoaded(false);
      setUrl(nextUrl);
      onSlotAssignedRef.current?.(primary.slotId, nextUrl);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Der Preview-Slot konnte nicht geöffnet werden.");
    });
    return () => { active = false; };
  }, [
    effectiveSessionKey,
    input.isolate,
    input.path,
    input.projectId,
    input.requestedSlotId,
    input.storageProfileId,
    input.targetPort,
    input.visible,
    retryKey,
    routeActive,
  ]);

  useEffect(() => {
    if (!session) return;
    const renew = window.setInterval(() => {
      void apiClient.renewPreviewSession(session.id).catch(() => {
        // Die sichtbare Preview bleibt bestehen; der nächste Nutzerimpuls meldet den Fehler.
      });
    }, 10 * 60_000);
    return () => window.clearInterval(renew);
  }, [session]);

  useEffect(() => {
    bridge.attach(routeActive ? iframeRef.current : null, routeActive ? url : null);
  }, [bridge, input.reloadKey, routeActive, runtimeReloadKey, url]);

  useEffect(() => {
    if (!session?.capabilities.includes("diagnostics") || !routeActive) return;
    let flushing = false;
    const flush = window.setInterval(() => {
      if (flushing) return;
      const batch = bridge.takeBatch();
      if (batch.events.length === 0 && batch.dropped === 0) return;
      flushing = true;
      void apiClient.sendPreviewDiagnostics({
        previewNodeId: input.previewNodeId,
        sessionId: session.id,
        bridgeSessionId: bridge.sessionId,
        droppedSinceLastBatch: batch.dropped,
        events: batch.events.map((event) => ({ ...event, previewNodeId: input.previewNodeId, sessionId: session.id })),
      }).catch(() => {
        bridge.restoreBatch(batch);
      }).finally(() => {
        flushing = false;
      });
    }, 2_000);
    return () => window.clearInterval(flush);
  }, [bridge, input.previewNodeId, routeActive, session]);

  return {
    routeActive,
    iframeRef,
    bridge,
    bridgeStatus,
    url,
    setUrl,
    session,
    setSession,
    error,
    setError,
    loaded,
    setLoaded,
    retryKey,
    setRetryKey,
    runtimeReloadKey,
    setRuntimeReloadKey,
    events,
    dropped,
    assignmentRef,
    effectiveSessionKey,
    queueEventState,
  };
}
