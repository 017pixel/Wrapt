import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { ExternalLinkIcon, WarningIcon } from "./icons";
import type { Panel, Project, ServiceMode } from "@wrapt/contracts";
import { WRAPT_LIMITS } from "@wrapt/contracts";
import { useWraptNotice } from "../stores/wraptNotice";
import { useLayoutStore } from "../stores/layout";
import { DevicePreviewFrame } from "./DevicePreviewFrame";
import type { DeviceOrientation, DevicePresetId } from "../config/devicePresets";
import { TerminalArea } from "./terminal/TerminalArea";
import { FileManagerPanel } from "./files/FileManagerPanel";
import { LocalPorts } from "./preview/LocalPorts";
import { PreviewSlotFrame, relayCanvasPinch } from "./PreviewSlotFrame";
import { apiClient } from "../lib/apiClient";
import { useRouteActivity } from "../lib/routeActivity";
import { t3ThreadIdFromPath } from "../lib/t3Thread";
import { usePanelPresenceStore } from "../stores/panelPresence";
import { panelTitles } from "../lib/toolLabels";
import { wraptQueries } from "../lib/queryOptions";
import { ToolPanelActionControls } from "./ToolPanelActionControls";
import { ToolPanelHeader } from "./ToolPanelHeader";
import { ToolPanelProjectBindingState } from "./ToolPanelProjectBindingState";
import { resolvePanel, type ResolvedPanel } from "./toolPanelResolution";
import type { CodeServerState } from "../lib/codeServerAvailability";
import { useToolPanelContextMenu } from "./useToolPanelContextMenu";

export { projectBoundCodeServerProxyUrl, projectBoundCodeServerUrl } from "./toolPanelResolution";

function opencodeSessionIdFromPath(path: string): string | null {
  const query = new URLSearchParams(path.split("?")[1] ?? "");
  const querySession = query.get("session") ?? query.get("sessionId");
  if (querySession) return querySession;
  const segments = path.split("?")[0]?.split("/").filter(Boolean) ?? [];
  const index = segments.findIndex((segment) => segment === "session" || segment === "sessions");
  return index >= 0 ? segments[index + 1] ?? null : null;
}

const HermesShell = lazy(() => import("./hermes/HermesShell").then((module) => ({ default: module.HermesShell })));

interface ToolPanelProps {
  panel: Panel;
  project: Project | undefined;
  isFocused: boolean;
  codeServerMode?: ServiceMode;
  codeServerState?: CodeServerState;
  onFocus?: () => void;
  standalone?: boolean;
  externalMaximized?: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
  onReload?: () => void;
  onClose?: () => void;
  minimal?: boolean;
  terminalRenderScale?: number;
  terminalSessionId?: string | null;
  actionPlacement?: "overlay" | "topbar" | "hidden";
}

export function ToolPanel({ panel, project, isFocused, codeServerMode = "external", codeServerState, onFocus, standalone = false, externalMaximized, onMaximizedChange, onReload, onClose, minimal = false, terminalRenderScale = 1, terminalSessionId = null, actionPlacement = "overlay" }: ToolPanelProps) {
  const openPanel = useLayoutStore((s) => s.openPanel);
  const reloadPanel = useLayoutStore((s) => s.reloadPanel);
  const closePanel = useLayoutStore((s) => s.closePanel);
  const maximizePanel = useLayoutStore((s) => s.maximizePanel);
  const restorePanels = useLayoutStore((s) => s.restorePanels);
  const maximizedPanelId = useLayoutStore((s) => s.maximizedPanelId);
  const routeActive = useRouteActivity();
  const needsProjectAssociation = panel.type === "code-server";
  const projectLookup = useQuery({
    ...wraptQueries.projects(),
    enabled: routeActive && needsProjectAssociation && !project,
  });
  const [standaloneMaximized, setStandaloneMaximized] = useState(false);
  const [standaloneReloadKey, setStandaloneReloadKey] = useState(0);
  const [topbarTarget, setTopbarTarget] = useState<HTMLElement | null>(null);
  const isMaximized = externalMaximized ?? (standalone ? standaloneMaximized : maximizedPanelId === panel.id);
  const [deviceId, setDeviceId] = useState<DevicePresetId>("responsive");
  const [orientation, setOrientation] = useState<DeviceOrientation>("portrait");
  const [localPreview, setLocalPreview] = useState<ResolvedPanel | null>(null);
  const [previewPublicUrl, setPreviewPublicUrl] = useState<string | null>(null);
  const [previewSlotId, setPreviewSlotId] = useState<number | null>(() => {
    try {
      const raw = window.sessionStorage.getItem(`wrapt:preview-slot:${panel.id}`);
      return raw ? Number(raw) : null;
    } catch { return null; }
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (panel.type !== "t3-code" && panel.type !== "opencode") return;
    // Route-Bridges melden den aktuellen Chat aus dem iframe. Die Quelle des
    // Events plus event.source verhindern, dass geparkte Panels Presence mischen.
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { source?: unknown; version?: unknown; type?: unknown; path?: unknown } | null;
      if (!data || data.version !== 1 || data.type !== "route.changed" || typeof data.path !== "string") return;
      if (panel.type === "t3-code" && data.source === "wrapt-t3") {
        usePanelPresenceStore.getState().setT3Thread(panel.id, t3ThreadIdFromPath(data.path));
      }
      if (panel.type === "opencode" && data.source === "wrapt-opencode") {
        usePanelPresenceStore.getState().setOpenCodeSession(panel.id, opencodeSessionIdFromPath(data.path));
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      usePanelPresenceStore.getState().clearPanel(panel.id);
    };
  }, [panel.id, panel.type]);

  useEffect(() => {
    if (panel.type !== "t3-code") return;
    // Der T3-„Open in VS Code"-Button öffnet seinen Zielordner statt einer
    // toten vscode://-Navigation im code-server der Workbench: eingebettet als
    // neuer Editor-Bereich, auf der eigenständigen Werkzeugseite als Sprung.
    const handleT3EditorRequest = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown; folder?: unknown } | null;
      if (data?.type !== "wrapt:open-editor") return;
      const folder = typeof data.folder === "string" && data.folder.length > 0 ? data.folder : null;
      if (standalone) {
        const params = new URLSearchParams(folder ? { folder } : {});
        window.location.assign(`/code-editor/?${params.toString()}`);
        return;
      }
      if (openPanel({
        type: "code-server",
        projectId: panel.projectId,
        ...(folder ? { codeServerFolder: folder } : {}),
      }) === null) {
        useWraptNotice.getState().show(`Es können höchstens ${WRAPT_LIMITS.maxResidentTools} Werkzeuge gleichzeitig geöffnet sein. Schließe zuerst ein Panel.`);
      }
    };
    window.addEventListener("message", handleT3EditorRequest);
    return () => window.removeEventListener("message", handleT3EditorRequest);
  }, [openPanel, panel.id, panel.projectId, panel.type, standalone]);

  useEffect(() => {
    if (panel.type !== "preview" || localPreview) return;
    const queryPort = standalone ? Number(new URLSearchParams(window.location.search).get("port")) : NaN;
    let storedPort = NaN;
    try { storedPort = Number(window.sessionStorage.getItem(`wrapt:preview-target:${panel.id}`)); } catch { /* session storage may be unavailable */ }
    const port = Number.isInteger(queryPort) && queryPort > 0 ? queryPort : storedPort;
    if (Number.isInteger(port) && port > 0 && port <= 65_535) {
      setLocalPreview({ url: `http://127.0.0.1:${port}/`, mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: port, path: "/" });
    }
  }, [localPreview, panel.id, panel.type, standalone]);

  const configuredPanel = resolvePanel(panel, project, codeServerMode, codeServerState);
  const resolved = panel.type === "preview" && localPreview ? localPreview : configuredPanel;
  const projectAssociationMissing = needsProjectAssociation
    && !project
    && projectLookup.isSuccess
    && !projectLookup.isError;
  const projectLookupFailed = needsProjectAssociation && !project && projectLookup.isError;
  // Extern-Öffnen führt bei T3 auf die gehostete App; eingebettet läuft der /t3-Proxy.
  const externalToolUrl = (panel.type === "t3-code" ? (resolved?.url ?? resolved?.proxyUrl) : (resolved?.proxyUrl ?? resolved?.url)) ?? null;

  const [loaded, setLoaded] = useState(false);
  const effectiveReloadKey = panel.reloadKey + standaloneReloadKey;
  const panelSource = panel.type === "t3-code"
    ? `${resolved?.proxyUrl ?? resolved?.url ?? ""}${panel.t3Path ?? ""}`
    : resolved?.proxyUrl ?? resolved?.url ?? "";
  useEffect(() => {
    setLoaded(false);
  }, [effectiveReloadKey, panelSource]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (panel.type !== "code-server" || !frame) return;
    const suppressBrowserMenu = (event: MouseEvent) => event.preventDefault();
    frame.addEventListener("contextmenu", suppressBrowserMenu, { passive: false });
    return () => frame.removeEventListener("contextmenu", suppressBrowserMenu);
  }, [effectiveReloadKey, panel.type, panelSource]);

  useEffect(() => {
    if (actionPlacement !== "topbar" || !routeActive) { setTopbarTarget(null); return; }
    setTopbarTarget(document.getElementById("topbar-tool-actions"));
  }, [actionPlacement, routeActive]);

  useEffect(() => {
    if (!isMaximized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (onMaximizedChange) onMaximizedChange(false);
        else if (standalone) setStandaloneMaximized(false);
        else restorePanels();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("has-maximized-tool");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("has-maximized-tool");
    };
  }, [isMaximized, onMaximizedChange, restorePanels, standalone]);

  const showAvailabilityWarning =
    !minimal && project && project.availability !== "available" && resolved?.reason === null;
  const showPreviewStart = panel.type === "preview" && !localPreview && (configuredPanel === null || configuredPanel.reason !== null);
  const reload = () => {
    if (onReload) onReload();
    else if (standalone) setStandaloneReloadKey((key) => key + 1);
    else reloadPanel(panel.id);
  };
  const close = () => {
    if (panel.type === "preview" && previewSlotId !== null) {
      void apiClient.assignPreviewSlot({
        slotId: previewSlotId,
        targetPort: null,
        isolate: true,
        ...(resolved?.targetPort ? { expectedTargetPort: resolved.targetPort } : {}),
      });
      try {
        window.sessionStorage.removeItem(`wrapt:preview-slot:${panel.id}`);
        window.sessionStorage.removeItem(`wrapt:preview-target:${panel.id}`);
      } catch {
        // Der Server gibt den Slot trotzdem frei.
      }
    }
    if (onClose) onClose();
    else closePanel(panel.id);
  };
  const toggleFullscreen = () => {
    if (onMaximizedChange) onMaximizedChange(!isMaximized);
    else if (standalone) setStandaloneMaximized(!isMaximized);
    else if (isMaximized) restorePanels();
    else maximizePanel(panel.id);
  };
  const openPanelMenu = useToolPanelContextMenu({
    panel,
    project,
    externalToolUrl: externalToolUrl ?? null,
    isMaximized,
    standalone,
    surfaceRef,
    onReload: reload,
    onClose: close,
    onToggleFullscreen: toggleFullscreen,
  });
  const panelActions = <ToolPanelActionControls
    panel={panel}
    resolved={resolved}
    minimal={minimal}
    actionPlacement={actionPlacement}
    standalone={standalone}
    isMaximized={isMaximized}
    externalToolUrl={externalToolUrl}
    deviceId={deviceId}
    onDeviceChange={setDeviceId}
    onRotate={() => setOrientation((current) => current === "portrait" ? "landscape" : "portrait")}
    previewSlotId={previewSlotId}
    previewPublicUrl={previewPublicUrl}
    onReload={reload}
    onClose={close}
    onContextMenu={openPanelMenu}
    onToggleFullscreen={toggleFullscreen}
  />;

  return (
    <section
      ref={surfaceRef}
      data-panel-type={panel.type}
      className={`tool-surface group flex h-full min-h-0 flex-col ${standalone ? "tool-surface-standalone" : ""} ${isMaximized ? "tool-surface-maximized" : ""} ${
        isFocused ? "border-ink-600" : "border-line"
      }`}
      onPointerDown={(event) => {
        // Eingebettete Werkzeuge, insbesondere T3 Code, gehören zur Knoten-
        // Oberfläche. Ihre Pointer-Gesten dürfen nicht als Canvas-Pan starten.
        event.stopPropagation();
        onFocus?.();
      }}
      onWheel={(event) => event.stopPropagation()}
    >
      {!minimal && !standalone ? <ToolPanelHeader
        panel={panel}
        project={project}
        isFocused={isFocused}
        resolved={resolved}
        onContextMenu={openPanelMenu}
      /> : null}

      {panelActions ? actionPlacement === "topbar"
        ? routeActive && topbarTarget ? createPortal(panelActions, topbarTarget) : null
        : panelActions : null}

      {showAvailabilityWarning ? (
        <div className="flex items-center gap-2 border-b border-warn/20 bg-warn-soft/50 px-3 py-1.5 text-[12px] text-warn">
          <WarningIcon className="h-3.5 w-3.5 shrink-0" />
          Projekt-Verfügbarkeit: {project!.availability}. Aktionen könnten fehlschlagen.
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-ink-950">
        {panel.type === "files" ? (
          <FileManagerPanel minimal={minimal} />
        ) : panel.type === "preview" && resolved?.targetPort ? (
          <PreviewSlotFrame
            targetPort={resolved.targetPort}
            path={resolved.path}
            requestedSlotId={previewSlotId}
            previewNodeId={`panel:${panel.id}`}
            deviceId={deviceId}
            orientation={orientation}
            reloadKey={effectiveReloadKey}
            showControls
            title={`${project?.name ?? "Lokale"} Preview`}
            onSlotAssigned={(slotId, url) => {
              setPreviewSlotId(slotId);
              setPreviewPublicUrl(url);
              try { window.sessionStorage.setItem(`wrapt:preview-slot:${panel.id}`, String(slotId)); } catch { /* Session remains server-side. */ }
            }}
            {...(onFocus ? { onFocus } : {})}
          />
        ) : panel.type === "terminal" || panel.type === "codex" || panel.type === "claude" ? (
          <div className="flex h-full min-h-0">
            <TerminalArea
              areaId={panel.id}
              initialProjectId={panel.projectId}
              kind={panel.type === "terminal" ? "shell" : panel.type}
              renderScale={terminalRenderScale}
              minimal={minimal}
              requestedSessionId={terminalSessionId}
            />
          </div>
        ) : panel.type === "hermes" ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Hermes wird geladen…</div>}>
            <HermesShell variant="panel" minimal={minimal} panel={panel} active={routeActive && isFocused} />
          </Suspense>
        ) : projectLookupFailed || projectAssociationMissing ? (
          <ToolPanelProjectBindingState
            projectLookupFailed={projectLookupFailed}
            projectAssociationMissing={projectAssociationMissing}
            projectId={panel.projectId}
            runtimeId={panel.id}
            standalone={standalone}
            onRetry={() => void projectLookup.refetch()}
          />
        ) : showPreviewStart ? (
          <LocalPorts projectId={project?.id ?? null} projectName={project?.name ?? "dieses Projekt"} allowAllPorts onOpen={(port) => {
            if (!port.localUrl) return;
            setLocalPreview({ url: port.localUrl, mode: "embedded", embed: true, proxyUrl: port.proxyUrl, reason: null, targetPort: port.port, path: "/" });
          }} />
        ) : resolved === null ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-faint">
            Projektdaten werden geladen…
          </div>
        ) : resolved.reason ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <WarningIcon className="h-6 w-6 text-warn" />
            <p className="text-sm text-muted">{resolved.reason}</p>
          </div>
        ) : resolved.embed && (resolved.url || resolved.proxyUrl) ? (
          <>
            {!loaded ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-950 text-sm text-muted">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-600 border-t-accent" />
              </div>
            ) : null}
            <DevicePreviewFrame
              deviceId={panel.type === "preview" ? deviceId : "responsive"}
              orientation={orientation}
            >
              <iframe
                key={effectiveReloadKey}
                ref={iframeRef}
                src={panelSource}
                title={panelTitles[panel.type]}
                onLoad={(event) => { setLoaded(true); relayCanvasPinch(event.currentTarget); }}
                onPointerDown={(event) => {
                  event.currentTarget.focus();
                  event.currentTarget.contentWindow?.focus();
                }}
                className="h-full w-full border-0 bg-white"
                allowFullScreen
                referrerPolicy="same-origin"
                {...(panel.type === "t3-code" ? { allow: "local-network-access; local-network; loopback-network" } : {})}
              />
            </DevicePreviewFrame>
          </>
        ) : resolved.url ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <ExternalLinkIcon className="h-6 w-6 text-muted" />
            <p className="max-w-xs text-sm text-muted">
              Dieses Werkzeug kann nicht eingebettet werden.
            </p>
            <a
              href={resolved.url}
              target="_blank"
              rel="noopener noreferrer"
              className="quiet-button-primary"
            >
              Extern öffnen
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
