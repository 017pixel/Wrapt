import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Layout, LayoutChangedMeta } from "react-resizable-panels";
import type { TerminalKind, TerminalPaneLayout, TerminalSession } from "@wrapt/contracts";
import { MonitorOffIcon, PlusIcon, TerminalIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { useTerminalResponsiveLayout } from "./useTerminalResponsiveLayout";
import { useTerminalOrbitHandoff } from "./terminal-handoff";
import { usePaneWidth } from "../../lib/usePaneWidth";
import { useRouteActivity } from "../../lib/routeActivity";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";
import { useSidebarPreferences } from "../../stores/sidebarPreferences";
import { kindLabels, statusLabel } from "./terminal-labels";
import { TerminalKeybar } from "./terminal-keybar";
import { TerminalSessionPicker } from "./terminal-session-picker";
import { useTerminalSessionRequest } from "./useTerminalSessionRequest";
import { TerminalSidebar } from "./sidebar/TerminalSidebar";
import { TerminalCanvas } from "./TerminalCanvas";
import { WebTerminal, type WebTerminalHandle } from "./WebTerminal";
import { useAutoCreateTerminalPane } from "./useAutoCreateTerminalPane";
import type { TerminalMeta } from "./terminal-types";
import {
  createTerminalOps,
  appendRuntimeToLayout,
  layoutContainsRuntime,
  layoutRuntimeIds,
  MAX_TERMINAL_PANES,
  paneForRuntime,
  removeRuntimeFromLayout,
} from "./workspace/terminalWorkspaceModel";
import { openSessionOps } from "./workspace/terminal-session-operations";
import type { DndDragState } from "./sidebar/useTerminalDnd";

interface TerminalAreaProps {
  areaId?: string;
  initialProjectId?: string | null;
  kind?: TerminalKind;
  renderScale?: number;
  layout?: "tabs" | "bento";
  maxTabs?: number;
  minimal?: boolean;
  requestedSessionId?: string | null;
}

interface VisiblePane { id: string; runtimeId: string; }

const WARM_TERMINAL_LIMIT = 4;

function layoutPanes(layout: TerminalPaneLayout | null): VisiblePane[] {
  if (!layout) return [];
  return layout.type === "pane" ? [{ id: layout.id, runtimeId: layout.runtimeId }] : layout.children;
}

export function TerminalArea({
  areaId = "standalone",
  initialProjectId = null,
  kind = "shell",
  renderScale = 1,
  layout = "tabs",
  minimal = false,
  requestedSessionId = null,
}: TerminalAreaProps) {
  const { isMobile, hasTouchControls, sidebarVisible, setSidebarVisible, showSingleMobilePane } = useTerminalResponsiveLayout();
  const routeActive = useRouteActivity();
  const openSessionInOrbit = useTerminalOrbitHandoff();
  const orbitEnabled = useSidebarPreferences((state) => !state.hiddenPages.has("workbench"));
  const bento = layout === "bento";
  const terminalSidebar = usePaneWidth({ storageKey: "wrapt.terminal-sidebar.v1", initial: 256, min: 220, max: 420 });
  const document = useTerminalWorkspaceStore((state) => state.document);
  const pendingOps = useTerminalWorkspaceStore((state) => state.pendingOps);
  const queueOps = useTerminalWorkspaceStore((state) => state.queueOps);
  const setRuntimeCwd = useTerminalWorkspaceStore((state) => state.setRuntimeCwd);
  const runtimeCwds = useTerminalWorkspaceStore((state) => state.runtimeCwds);
  const sessions = useQuery({ ...wraptQueries.terminalSessions(), refetchInterval: false, enabled: routeActive });
  useTerminalSessionRequest({ areaId, active: routeActive, requestedSessionId, document, sessions: sessions.data?.sessions });
  const handles = useRef(new Map<string, WebTerminalHandle>());
  const splitSaveFrame = useRef<number | null>(null);
  const [meta, setMeta] = useState<Record<string, TerminalMeta>>({});
  const [keyboardRow, setKeyboardRow] = useState<"keys" | "actions">("keys");
  const [stickyCtrl, setStickyCtrl] = useState(false);
  const [stickyAlt, setStickyAlt] = useState(false);
  const [warmRuntimeIds, setWarmRuntimeIds] = useState<string[]>([]);
  const [suspendedSplitLayout, setSuspendedSplitLayout] = useState<TerminalPaneLayout | null>(null);
  const [terminalDrag, setTerminalDrag] = useState<DndDragState | null>(null);

  useEffect(() => {
    globalThis.document.documentElement.style.setProperty("--terminal-sidebar-width", `${terminalSidebar.width}px`);
  }, [terminalSidebar.width]);

  const toggleNativeFullscreen = useCallback(() => {
    if (globalThis.document.fullscreenElement) void globalThis.document.exitFullscreen();
    else void globalThis.document.documentElement.requestFullscreen?.();
  }, []);

  const areaLayout = document?.areaLayouts[areaId] ?? null;
  const paneLayout = areaLayout?.paneLayout ?? null;
  const focusedPaneId = areaLayout?.focusedPaneId ?? null;
  const panes = layoutPanes(paneLayout);
  const parkedPanes = (document ? warmRuntimeIds : [])
    .filter((runtimeId) => !panes.some((pane) => pane.runtimeId === runtimeId) && document?.entries.some((entry) => entry.runtimeId === runtimeId))
    .map((runtimeId) => paneForRuntime(runtimeId));
  const focusedRuntimeId = (() => {
    if (!paneLayout) return null;
    if (paneLayout.type === "pane") return paneLayout.runtimeId;
    return paneLayout.children.find((pane) => pane.id === focusedPaneId)?.runtimeId ?? paneLayout.children[0]!.runtimeId;
  })();
  const activeMeta = focusedRuntimeId ? meta[focusedRuntimeId] : undefined;
  const hasActivePane = panes.length > 0;
  const hasSplit = paneLayout?.type === "split";

  const rememberWarmRuntimes = useCallback((runtimeIds: readonly string[]) => {
    setWarmRuntimeIds((current) => {
      const next = [...new Set(runtimeIds), ...current].slice(0, WARM_TERMINAL_LIMIT);
      return next.length === current.length && next.every((runtimeId, index) => runtimeId === current[index]) ? current : next;
    });
  }, []);

  useEffect(() => {
    const known = new Set(document?.entries.map((entry) => entry.runtimeId).filter((runtimeId): runtimeId is string => runtimeId !== null) ?? []);
    setWarmRuntimeIds((current) => {
      const next = current.filter((runtimeId) => known.has(runtimeId));
      return next.length === current.length ? current : next;
    });
  }, [document]);

  const openEntry = useCallback((runtimeId: string) => {
    const state = useTerminalWorkspaceStore.getState();
    if (!state.document) return;
    const current = state.document.areaLayouts[areaId]?.paneLayout ?? null;
    if (current && current.type === "pane" && suspendedSplitLayout && layoutContainsRuntime(suspendedSplitLayout, runtimeId)) {
      rememberWarmRuntimes([runtimeId, ...layoutRuntimeIds(suspendedSplitLayout)]);
      queueOps([
        { type: "setPaneLayout", areaId, layout: suspendedSplitLayout },
        { type: "setFocusedPane", areaId, paneId: paneForRuntime(runtimeId).id },
      ]);
      setSuspendedSplitLayout(null);
      return;
    }
    if (current?.type === "split" && !layoutContainsRuntime(current, runtimeId)) setSuspendedSplitLayout(current);
    rememberWarmRuntimes([runtimeId, ...layoutRuntimeIds(current)]);
    queueOps(openSessionOps(state.document, areaId, runtimeId, sessions.data?.sessions ?? []));
  }, [areaId, queueOps, rememberWarmRuntimes, sessions.data?.sessions, suspendedSplitLayout]);

  const openInSplit = useCallback((runtimeId: string) => {
    const state = useTerminalWorkspaceStore.getState();
    const doc = state.document;
    if (!doc) return;
    const current = doc.areaLayouts[areaId]?.paneLayout ?? null;
    if (current && layoutContainsRuntime(current, runtimeId)) {
      state.queueOps([{ type: "setFocusedPane", areaId, paneId: paneForRuntime(runtimeId).id }]);
      return;
    }
    if (layoutPanes(current).length >= MAX_TERMINAL_PANES) return;
    const next = appendRuntimeToLayout(current, runtimeId);
    setSuspendedSplitLayout(null);
    rememberWarmRuntimes([runtimeId, ...layoutRuntimeIds(current)]);
    queueOps([
      { type: "setPaneLayout", areaId, layout: next },
      { type: "setFocusedPane", areaId, paneId: paneForRuntime(runtimeId).id },
    ]);
  }, [areaId, queueOps, rememberWarmRuntimes]);

  const create = useCallback((folderId: string | null = null, projectId: string | null = initialProjectId) => {
    const state = useTerminalWorkspaceStore.getState();
    if (!state.document) return null;
    const count = state.document.entries.filter((entry) => entry.kind === kind).length + 1;
    const { ops, runtimeId } = createTerminalOps(state.document, areaId, {
      kind,
      projectId,
      name: `${kindLabels[kind]} ${count}`,
      ...(folderId !== null ? { parentFolderId: folderId } : {}),
    });
    queueOps(ops);
    return runtimeId;
  }, [areaId, initialProjectId, kind, queueOps]);

  useAutoCreateTerminalPane(minimal && requestedSessionId === null, Boolean(document), hasActivePane, initialProjectId, create);
  const createSplit = useCallback(() => {
    const state = useTerminalWorkspaceStore.getState();
    const doc = state.document;
    if (!doc) return;
    const current = doc.areaLayouts[areaId]?.paneLayout ?? null;
    if (layoutPanes(current).length >= MAX_TERMINAL_PANES) return;
    const count = doc.entries.filter((entry) => entry.kind === kind).length + 1;
    const { ops, runtimeId } = createTerminalOps(doc, areaId, { kind, name: `${kindLabels[kind]} ${count}` });
    if (!hasActivePane) { state.queueOps(ops); return; }
    const next = appendRuntimeToLayout(current, runtimeId);
    setSuspendedSplitLayout(null);
    rememberWarmRuntimes([runtimeId, ...layoutRuntimeIds(current)]);
    state.queueOps([...ops, { type: "setPaneLayout", areaId, layout: next }, { type: "setFocusedPane", areaId, paneId: paneForRuntime(runtimeId).id }]);
  }, [areaId, hasActivePane, kind, rememberWarmRuntimes]);

  const closePane = useCallback((runtimeId: string) => {
    const state = useTerminalWorkspaceStore.getState();
    const doc = state.document;
    if (!doc) return;
    const current = doc.areaLayouts[areaId]?.paneLayout ?? null;
    const next = removeRuntimeFromLayout(current, runtimeId);
    setSuspendedSplitLayout((suspended) => suspended && layoutContainsRuntime(suspended, runtimeId) ? null : suspended);
    queueOps([{ type: "setPaneLayout", areaId, layout: next }]);
  }, [areaId, queueOps]);

  const clearSplit = useCallback(() => {
    if (!focusedRuntimeId) return;
    const state = useTerminalWorkspaceStore.getState();
    if (!state.document) return;
    setSuspendedSplitLayout(null);
    queueOps([
      { type: "setPaneLayout", areaId, layout: paneForRuntime(focusedRuntimeId) },
      { type: "setFocusedPane", areaId, paneId: paneForRuntime(focusedRuntimeId).id },
    ]);
  }, [areaId, focusedRuntimeId, queueOps]);

  const saveSplitLayout = useCallback((layoutData: Layout, details: LayoutChangedMeta) => {
    if (!details.isUserInteraction || paneLayout?.type !== "split") return;
    const children = paneLayout.children;
    const rawSizes = children.map((child) => layoutData[child.id] ?? 0);
    const total = rawSizes.reduce((sum, size) => sum + size, 0);
    if (total <= 0 || rawSizes.some((size) => size <= 0)) return;
    const sizes = rawSizes.map((size) => (size / total) * 100);
    if (splitSaveFrame.current !== null) window.cancelAnimationFrame(splitSaveFrame.current);
    splitSaveFrame.current = window.requestAnimationFrame(() => {
      splitSaveFrame.current = null;
      const state = useTerminalWorkspaceStore.getState();
      if (!state.document) return;
      const current = state.document.areaLayouts[areaId]?.paneLayout;
      if (current?.type === "split") {
        queueOps([{ type: "setPaneLayout", areaId, layout: { ...current, sizes } }]);
      }
    });
  }, [areaId, paneLayout, queueOps]);

  useEffect(() => () => {
    if (splitSaveFrame.current !== null) window.cancelAnimationFrame(splitSaveFrame.current);
  }, []);

  const sessionPicker = minimal ? null : (
    <TerminalSessionPicker
      kind={kind}
      sessions={sessions.data?.sessions ?? []}
      openTabIds={panes.map((pane) => pane.runtimeId)}
      orbitEnabled={orbitEnabled}
      onOpen={(session) => openEntry(session.runtimeId)}
      onOpenInOrbit={openSessionInOrbit}
      onRestart={async (session: TerminalSession) => { await apiClient.restartTerminalSession(session.id); void sessions.refetch(); }}
      onClose={async (session: TerminalSession) => { await apiClient.closeTerminalSession(session.id); void sessions.refetch(); }}
    />
  );

  const activeHandle = () => (focusedRuntimeId ? handles.current.get(focusedRuntimeId) ?? null : null);
  const pressKey = (key: string) => {
    activeHandle()?.sendKey(key, { ctrl: stickyCtrl, alt: stickyAlt });
    setStickyCtrl(false);
    setStickyAlt(false);
  };

  if (!document) return <div className="terminal-area-loading">Terminal wird vorbereitet…</div>;

  const renderDropZone = () => {
    if (!terminalDrag || minimal) return null;
    const full = panes.length >= MAX_TERMINAL_PANES;
    return (
      <div
        className={`terminal-drop-zone ${full ? "is-full" : ""}`}
        {...(full ? {} : { "data-terminal-drop-zone": "right" })}
        role="status"
        aria-live="polite"
      >
        {full ? "Maximal 4 Terminals" : "Hier rechts ablegen"}
      </div>
    );
  };

  const renderPane = (pane: VisiblePane, visible: boolean, position?: "left" | "right", index?: number) => {
    const entry = document.entries.find((candidate) => candidate.runtimeId === pane.runtimeId);
    const awaitingCreation = pendingOps.some((operation) => operation.type === "createEntry" && operation.entry.runtimeId === pane.runtimeId);
    return (
      <div
        key={pane.id}
        data-pane-id={pane.id}
        data-pane-position={position}
        data-terminal-index={index}
        className={`terminal-session-pane ${focusedRuntimeId === pane.runtimeId ? "is-focused" : ""} ${visible ? "is-visible" : "is-parked"}`}
        inert={!visible}
        onPointerDown={() => visible && pane.runtimeId !== focusedRuntimeId && queueOps([{ type: "setFocusedPane", areaId, paneId: pane.id }])}
      >
        {awaitingCreation ? <div className="terminal-area-loading" role="status">Terminal wird vorbereitet…</div> : <WebTerminal
          ref={(handle) => { if (handle) handles.current.set(pane.runtimeId, handle); else handles.current.delete(pane.runtimeId); }}
          instanceId={pane.runtimeId}
          kind={entry?.kind ?? kind}
          projectId={entry?.projectId ?? null}
          initialCwd={entry?.initialCwd ?? null}
          active={routeActive && visible}
          focused={focusedRuntimeId === pane.runtimeId}
          renderScale={renderScale}
          onMetaChange={(next) => {
            setRuntimeCwd(pane.runtimeId, next.cwd);
            setMeta((current) => {
              const previous = current[pane.runtimeId];
              if (previous?.status === next.status && previous.cwd === next.cwd && previous.error === next.error && previous.cols === next.cols && previous.rows === next.rows) return current;
              return { ...current, [pane.runtimeId]: next };
            });
          }}
        />}
      </div>
    );
  };

  const emptyState = <><MonitorOffIcon className="h-6 w-6" /><strong>Kein Terminal geöffnet</strong><button type="button" className="quiet-button-primary" onClick={() => create(null, initialProjectId)}><PlusIcon className="h-4 w-4" /> {kindLabels[kind]} öffnen</button></>;

  return (
    <section className="terminal-area" data-split={hasSplit ? "true" : undefined}>
      {minimal ? <span className="sr-only terminal-connection-status" aria-live="polite">{activeMeta ? statusLabel[activeMeta.status] : statusLabel.connecting}</span> : null}
      <div className={`terminal-area-body ${sidebarVisible ? "has-sidebar" : ""}`}>
        {!minimal ? (
          <TerminalSidebar
            areaId={areaId}
            kind={kind}
            meta={meta}
            sessions={sessions.data?.sessions ?? []}
            cwds={runtimeCwds}
            isMobile={isMobile}
            open={sidebarVisible}
            activeRuntimeId={focusedRuntimeId}
            hasSplit={hasSplit}
            hasActivePane={hasActivePane}
            onClose={() => setSidebarVisible(false)}
            onNewTerminal={() => create(null, initialProjectId)}
            onNewTerminalInFolder={(folderId) => create(folderId, initialProjectId)}
            onOpenEntry={openEntry}
            onOpenInSplit={openInSplit}
            onResync={(runtimeId) => handles.current.get(runtimeId)?.resync()}
            onRestart={(runtimeId) => handles.current.get(runtimeId)?.restart()}
            onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
            onCreateSplit={createSplit}
            onClearSplit={clearSplit}
            onClear={() => activeHandle()?.clear()}
            onClosePane={() => focusedRuntimeId && closePane(focusedRuntimeId)}
            sessionPicker={sessionPicker}
            sidebarWidth={terminalSidebar.width}
            onResizeStart={terminalSidebar.startResize}
            onResizeKeyboard={terminalSidebar.resizeWithKeyboard}
            onReload={() => globalThis.window.location.reload()}
            onFullscreen={toggleNativeFullscreen}
            onDragStateChange={setTerminalDrag}
          />
        ) : null}
        <div className="terminal-area-main">
          {!minimal && !sidebarVisible ? (
            <button type="button" className="terminal-sidebar-reopen" onClick={() => setSidebarVisible(true)} aria-label="Terminal-Sidebar einblenden" title="Terminal-Sidebar einblenden">
              <TerminalIcon className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <TerminalCanvas
            areaId={areaId}
            bento={bento}
            isMobile={isMobile}
            showSingleMobilePane={showSingleMobilePane}
            focusedRuntimeId={focusedRuntimeId}
            paneLayout={paneLayout}
            panes={panes}
            parkedPanes={parkedPanes}
            emptyState={emptyState}
            dropZone={renderDropZone()}
            renderPane={renderPane}
            onLayoutChanged={saveSplitLayout}
          />
          {!minimal && hasTouchControls ? (
            <TerminalKeybar
              keyboardRow={keyboardRow}
              stickyCtrl={stickyCtrl}
              stickyAlt={stickyAlt}
              hasActiveTab={hasActivePane}
              tabsFull={false}
              sessionPicker={sessionPicker}
              onSendKey={pressKey}
              onPaste={() => activeHandle()?.pasteFromClipboard()}
              onFocus={() => activeHandle()?.focus()}
              onCreate={() => create(null, initialProjectId)}
              onRestart={() => activeHandle()?.restart()}
              onClear={() => activeHandle()?.clear()}
              onClose={() => focusedRuntimeId && closePane(focusedRuntimeId)}
              onToggleCtrl={() => setStickyCtrl(!stickyCtrl)}
              onToggleAlt={() => setStickyAlt(!stickyAlt)}
              onSetKeyboardRow={setKeyboardRow}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
