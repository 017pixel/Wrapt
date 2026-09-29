import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NetworkIcon, WarningIcon } from "../icons";
import type { PreviewServiceEdge } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import { previewLiveWindowUrl } from "../../lib/previewExternalOpen";
import { resolvePreviewDevice } from "../../lib/previewDevice";
import { wraptQueries } from "../../lib/queryOptions";
import type { DeviceOrientation } from "../../config/devicePresets";
import { changeDevicePreviewScaleFactor, DevicePreviewFrame } from "../DevicePreviewFrame";
import { PreviewDiagnosticsSheet } from "./PreviewDiagnosticsSheet";
import { useRouteActivity } from "../../lib/routeActivity";
import { runPreviewSlotReset } from "../../lib/previewSlotRecovery";
import type { PreviewViewportSize } from "../../lib/previewViewport";
import { PreviewRuntimeControls } from "./PreviewRuntimeControls";
import { usePreviewRuntimeSession } from "./usePreviewRuntimeSession";
import { usePreviewRuntimeStorage } from "./usePreviewRuntimeStorage";

export interface LocalPreviewRuntimeProps {
  targetPort: number;
  path?: string;
  requestedSlotId?: number | null;
  isolate?: boolean;
  /** Stabile Storage-Identität des Slots aus dem Orbit-Dokument. */
  storageProfileId?: string | null;
  previewNodeId?: string | null;
  projectId?: string | null;
  sessionKey?: string;
  /** `null` erbt die Benutzerpräferenz. */
  deviceId?: string | null;
  orientation?: DeviceOrientation;
  reloadKey?: number;
  title?: string;
  lazy?: boolean;
  /** Sichtbare Steuerung für Reload, Verlauf, Ausrichtung und Diagnose. */
  showControls?: boolean;
  /** Vollständige Steuerleiste in der eigenständigen Simulatorfläche. */
  controlsVariant?: "overlay" | "simulator";
  viewportSize?: PreviewViewportSize | null;
  scaleFactor?: number;
  onScaleFactorChange?: (direction: -1 | 1) => void;
  toolbarPosition?: { x: number; y: number } | null;
  toolbarWidth?: number | null;
  onToolbarPositionChange?: (position: { x: number; y: number }) => void;
  onToolbarWidthChange?: (width: number) => void;
  onViewportSizeChange?: (size: PreviewViewportSize | null) => void;
  onDeviceChange?: (deviceId: string | null) => void;
  interactionLocked?: boolean;
  onSlotAssigned?: (slotId: number, url: string) => void;
  onOrientationChange?: (orientation: DeviceOrientation) => void;
  onFocus?: () => void;
}

export function reloadLocalPreview(
  bridgeConnected: boolean,
  navigate: (action: "reload") => void,
  remount: () => void,
) {
  if (bridgeConnected) navigate("reload");
  else remount();
}

export function relayCanvasPinch(iframe: HTMLIFrameElement) {
  try {
    const target = iframe.contentWindow;
    if (!target || target.__orbitPinchRelayInstalled) return;
    target.__orbitPinchRelayInstalled = true;
    target.addEventListener("wheel", (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = iframe.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent("orbit:iframe-pinch", { detail: {
        clientX: bounds.left + event.clientX,
        clientY: bounds.top + event.clientY,
        deltaY: event.deltaY,
      } }));
    }, { passive: false, capture: true });
  } catch {
    // Cross-Origin-Previews behalten ihre native Eingabe; nur gleiche Origins melden Pinch.
  }
}

/**
 * Gemeinsame Laufzeit aller lokalen Previews: Canvas, Sidebar, Vollbildroute und
 * das Browser-Panel verwenden dieselbe Komponente. Sie kapselt Session-Lease,
 * Slot-Affinität, Bridge-Handshake, Diagnose, Geräterahmen sowie Reset- und
 * Quarantänestatus.
 */
export function LocalPreviewRuntime({
  targetPort,
  path = "/",
  requestedSlotId = null,
  isolate = true,
  storageProfileId = null,
  previewNodeId = null,
  projectId = null,
  sessionKey,
  deviceId = null,
  orientation = "portrait",
  reloadKey = 0,
  title = "Development Preview",
  lazy = false,
  showControls = false,
  controlsVariant = "overlay",
  viewportSize = null,
  scaleFactor,
  onScaleFactorChange,
  toolbarPosition,
  toolbarWidth,
  onToolbarPositionChange,
  onToolbarWidthChange,
  onViewportSizeChange,
  onDeviceChange,
  interactionLocked = false,
  onSlotAssigned,
  onOrientationChange,
  onFocus,
}: LocalPreviewRuntimeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [graphSaving, setGraphSaving] = useState(false);
  const [previewScaleFactor, setPreviewScaleFactor] = useState(1);
  const routeActive = useRouteActivity();
  const preference = useQuery({ ...wraptQueries.previewDevicePreference(), enabled: routeActive });
  const resolvedDevice = resolvePreviewDevice({ deviceId, orientation }, preference.data);
  const candidatesQuery = useQuery({ ...wraptQueries.previewServiceCandidates(projectId), enabled: routeActive && visible && projectId !== null });
  const graphQuery = useQuery({
    ...wraptQueries.previewServiceGraph(projectId ?? "-", String(targetPort)),
    enabled: routeActive && visible && projectId !== null,
  });
  const runtime = usePreviewRuntimeSession({
    routeActive,
    targetPort,
    path,
    requestedSlotId,
    isolate,
    storageProfileId,
    previewNodeId,
    projectId,
    ...(sessionKey === undefined ? {} : { sessionKey }),
    graphRevision: graphQuery.data?.graph.updatedAt ?? null,
    visible,
    reloadKey,
    ...(onSlotAssigned === undefined ? {} : { onSlotAssigned }),
  });
  const {
    iframeRef, bridge, bridgeStatus, url, session, error, setError, loaded, setLoaded,
    setRetryKey, runtimeReloadKey, setRuntimeReloadKey, events, dropped,
    assignmentRef, effectiveSessionKey, queueEventState,
  } = runtime;
  const storage = usePreviewRuntimeStorage({
    bridge,
    routeActive,
    storageProfileId,
    session,
    previewNodeId,
    assignmentRef,
    queueEventState,
  });
  const { storageState, storageConflict } = storage;

  // ── Sichtbarkeit ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lazy || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy, visible]);

  // ── Service-Kandidaten ─────────────────────────────────────────────────────
  const confirmedPorts = new Set((graphQuery.data?.graph.edges ?? []).map((edge) => edge.port));
  const unconfirmed = (candidatesQuery.data?.candidates ?? []).filter((candidate) =>
    candidate.port !== targetPort && candidate.projectId === projectId && !confirmedPorts.has(candidate.port));
  const capacity = graphQuery.data?.capacity ?? null;

  const confirmCandidates = async () => {
    if (!projectId) return;
    setGraphSaving(true);
    try {
      const edges: PreviewServiceEdge[] = [
        ...(graphQuery.data?.graph.edges ?? []),
        ...unconfirmed.map((candidate) => ({
          serviceId: candidate.serviceId,
          projectId: candidate.projectId,
          port: candidate.port,
          protocol: candidate.supportsWebSocket ? "ws" as const : candidate.protocol,
          role: candidate.suggestedRole === "primary" ? "other" as const : candidate.suggestedRole,
          label: candidate.process ?? `Dienst ${candidate.port}`,
          probeStatus: candidate.probeStatus,
          source: "detected" as const,
          confirmedAt: new Date().toISOString(),
        })),
      ];
      await apiClient.savePreviewServiceGraph(projectId, String(targetPort), edges);
      await graphQuery.refetch();
      assignmentRef.current = null;
      setRetryKey((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Dienste konnten nicht verbunden werden.");
    } finally {
      setGraphSaving(false);
    }
  };

  const quarantined = error?.includes("Quarantäne") ?? false;

  return (
    <div ref={containerRef} className="preview-slot-frame">
      {!visible ? <div className="preview-slot-placeholder" aria-label="Preview wird bei Sichtbarkeit geladen" /> : null}

      {visible && projectId && unconfirmed.length > 0 ? (
        <div className="preview-dependency-consent">
          <NetworkIcon className="h-4 w-4" />
          <span>
            {unconfirmed.length} weitere {unconfirmed.length === 1 ? "Projekt-Dienst" : "Projekt-Dienste"} erkannt
            {capacity ? ` · ${capacity.freeSlots + capacity.reusableSlots} von ${capacity.totalSlots} Slots frei` : ""}
          </span>
          <button type="button" disabled={graphSaving} onClick={() => void confirmCandidates()}>Verbinden &amp; merken</button>
        </div>
      ) : null}

      {error ? (
        <div className="preview-slot-error">
          {quarantined ? <WarningIcon className="h-5 w-5" /> : <WarningIcon className="h-5 w-5" />}
          <span>{error}</span>
          <button type="button" onClick={() => { assignmentRef.current = null; setRetryKey((value) => value + 1); }}>Erneut versuchen</button>
        </div>
      ) : null}

      {visible && !error && !loaded ? <div className="preview-slot-loading"><span /><small>Preview wird verbunden…</small></div> : null}

      {visible && url ? (
        <DevicePreviewFrame
          deviceId={resolvedDevice.deviceId}
          orientation={resolvedDevice.orientation}
          scaleFactor={scaleFactor ?? previewScaleFactor}
          interactionLocked={interactionLocked}
          viewportSize={viewportSize}
        >
          <iframe
            ref={iframeRef}
            key={`${url}:${reloadKey}:${runtimeReloadKey}`}
            src={url}
            title={title}
            onLoad={(event) => {
              setLoaded(true);
              bridge.beginEpoch();
              bridge.attach(event.currentTarget, url);
              // Meldet sich die Bridge nicht, bleibt die Preview nutzbar — nur ohne Diagnose.
              window.setTimeout(() => bridge.markUnavailable(), 2_500);
              relayCanvasPinch(event.currentTarget);
            }}
            onPointerDown={(event) => {
              onFocus?.();
              event.currentTarget.focus();
              event.currentTarget.contentWindow?.focus();
            }}
            className="h-full w-full border-0 bg-white"
            allowFullScreen
            referrerPolicy="same-origin"
          />
        </DevicePreviewFrame>
      ) : null}

      {showControls && visible ? (
        <PreviewRuntimeControls
          variant={controlsVariant}
          deviceId={deviceId}
          resolvedDeviceId={resolvedDevice.deviceId}
          orientation={resolvedDevice.orientation}
          viewportSize={viewportSize}
          onDeviceChange={onDeviceChange}
          onViewportSizeChange={onViewportSizeChange}
          onOrientationChange={onOrientationChange}
          scaleFactor={previewScaleFactor}
          onScaleChange={onScaleFactorChange ?? ((direction) => setPreviewScaleFactor((value) => changeDevicePreviewScaleFactor(value, direction)))}
          bridgeConnected={bridgeStatus.connected}
          onBack={() => bridge.navigate("back")}
          onForward={() => bridge.navigate("forward")}
          onReload={() => reloadLocalPreview(
            bridgeStatus.connected,
            (action) => bridge.navigate(action),
            () => {
              setLoaded(false);
              setRuntimeReloadKey((value) => value + 1);
            },
          )}
          url={url}
          externalUrl={url ? projectId ? previewLiveWindowUrl({
            projectId,
            port: targetPort,
            path,
            title,
            sessionKey: effectiveSessionKey,
            previewNodeId,
            requestedSlotId: assignmentRef.current?.slotId ?? requestedSlotId,
            isolate,
            storageProfileId,
          }) : url : null}
          diagnosticsOpen={diagnosticsOpen}
          hasErrors={events.some((event) => event.severity === "error")}
          onToggleDiagnostics={() => setDiagnosticsOpen((open) => !open)}
          toolbarPosition={toolbarPosition}
          toolbarWidth={toolbarWidth}
          onToolbarPositionChange={onToolbarPositionChange}
          onToolbarWidthChange={onToolbarWidthChange}
        />
      ) : null}

      {diagnosticsOpen ? (
        <PreviewDiagnosticsSheet
          events={events}
          dropped={dropped}
          bridgeStatus={bridgeStatus}
          session={session}
          storageState={storageState}
          storageConflict={storageConflict}
          slotId={assignmentRef.current?.slotId ?? null}
          targetPort={targetPort}
          device={resolvedDevice}
          onClose={() => setDiagnosticsOpen(false)}
          onToggleStorage={storage.toggleStorage}
          onRestoreStorage={storage.restoreStorage}
          onKeepLocal={storage.keepLocal}
          onResetSlot={async () => {
            const slotId = assignmentRef.current?.slotId;
            if (!slotId || !session) return;
            const started = await apiClient.beginPreviewSlotReset(slotId, {
              expectedGeneration: session.slotGeneration,
              storageProfileId,
            });
            if (!started) return;
            const report = await runPreviewSlotReset(started.resetUrl, started.nonce);
            const verification = await apiClient.verifyPreviewSlotReset(slotId, report ?? {
              nonce: started.nonce,
              serviceWorkers: 0,
              cacheStorages: 0,
              localStorageKeys: 0,
              sessionStorageKeys: 0,
              indexedDatabases: 0,
              verifiable: false,
            });
            if (!report) {
              setError(verification?.message ?? "Der Reset konnte nicht verifiziert werden. Der Slot bleibt gesperrt.");
              return;
            }
            setError(verification?.state === "quarantined" ? verification.message : null);
            assignmentRef.current = null;
            setRetryKey((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}
