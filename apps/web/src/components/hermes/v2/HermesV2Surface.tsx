import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouteActivity } from "../../../lib/routeActivity";
import { useAppPreferences } from "../../../stores/appPreferences";
import type { HermesShellProps } from "../HermesClassicShell";
import { useHermesV2Chat } from "./useHermesV2Chat";
import { useHermesV2Sidebar } from "./useHermesV2Sidebar";
import { undoOrganization } from "./undo-shortcut";
import { useHermesV2Drawer } from "./useHermesV2Drawer";
import { useHermesV2SidebarWidth } from "./useHermesV2SidebarWidth";
import { HermesV2AreaNav, areaMarker } from "./HermesV2AreaNav";
import { HermesV2ChatHeader, HermesV2SidebarBrand, HermesV2SidebarFooter } from "./HermesV2Chrome";
import { HermesV2ChatSurface } from "./HermesV2ChatSurface";
import { HermesV2NewSessionDialog } from "./HermesV2NewSessionDialog";
import { HermesV2RenameDialog } from "./HermesV2TitleDialog";
import { HermesV2SidebarPanel } from "./HermesV2Sidebar";
import { HermesV2ConfigurationArea } from "./HermesV2ConfigurationArea";
import { HermesV2ResourceRegion } from "./HermesV2ResourceRegion";
import { useHermesV2Selection } from "./shell-selection";
import { DEFAULT_AREA, type SelectableArea } from "./resource-areas";
import "./hermes-v2.css";
import "./hermes-v2-resources.css";
import "./hermes-v2-layout.css";
import "./hermes-v2-density.css";
import "./hermes-v2-resize.css";
import "./hermes-v2-resource-layout.css";

// Tokenfortschritt betrifft den Chat; eigene Storeupdates bleiben durchlässig.
const MemoSidebarPanel = memo(HermesV2SidebarPanel);
const MemoResourceRegion = memo(HermesV2ResourceRegion);

export interface HermesV2SurfaceProps extends HermesShellProps {
  /** Eigenständige Oberfläche ohne Wrapt-Navigation. */
  standalone?: boolean | undefined;
}

const readVisibility = () =>
  typeof document === "undefined" ||
  document.visibilityState !== "hidden";
const subscribeVisibility = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};

/**
 * Nativer Einstieg: Sitzungsspalte, Toolbar, Bereichsauswahl und echte
 * Chatfläche. Route, Panel und Standalone teilen dieselbe Fläche. Der
 * Bereichszustand ist oberflächenlokal, es gibt keine Ressourcen-URL; eine
 * geparkte Route übernimmt keine fremden Suchparameter.
 */
export function HermesV2Surface({
  variant,
  minimal = false,
  active,
  standalone = false,
  panel,
  onHermesPathChange,
}: HermesV2SurfaceProps) {
  const routeActive = useRouteActivity();
  const documentVisible = useSyncExternalStore(
    subscribeVisibility,
    readVisibility,
    () => true,
  );
  const frameActive = active ?? routeActive;
  const panelId = panel?.id;
  const enabled = useAppPreferences((state) => state.hermesV2Enabled);
  const { sessionId, selectSession } = useHermesV2Selection(
    variant,
    panelId,
    panel?.hermesAdminPath,
    frameActive,
    onHermesPathChange,
  );
  const ownerId = useMemo(
    () =>
      panelId
        ? `hermes-panel-${panelId}`
        : standalone
          ? "hermes-standalone"
          : "hermes-route",
    [panelId, standalone],
  );

  // Bereichszustand vor dem Chathook: der erhaltene Chatowner bekommt
  // actualActive=false, sobald eine Ressourcenfläche, die Deletefläche oder
  // ein echter Overlaykontext den Chat verdeckt. Entwurf, Stream und Arbeit
  // bleiben trotzdem erhalten.
  const [area, setAreaState] = useState<SelectableArea>(DEFAULT_AREA);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [sidebarDialogOpen, setSidebarDialogOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
    rootRef,
    layerRef,
    compact,
    open: drawerOpen,
    modal,
    setOpen: setDrawerOpen,
  } = useHermesV2Drawer(
    true,
    frameActive,
    newSessionOpen || sidebarDialogOpen || deleteTarget !== null || renameSessionId !== null,
  );
  const deleteActive = deleteTarget !== null;
  const sidebarLayout = useHermesV2SidebarWidth(rootRef, frameActive && !compact && !sidebarCollapsed);
  const chatCovered =
    area !== "chat" ||
    deleteActive ||
    newSessionOpen ||
    sidebarDialogOpen ||
    (compact && drawerOpen);
  // Chatowner und Runtime bleiben bestehen; nur die sichtbare Chatfläche
  // weicht Ressourcenbereichen. Bereits erfasste Captures werden vom
  // actualActive-Guard der Runtime entwertet, nicht allein durch Unmount.
  const chat = useHermesV2Chat({
    ownerId,
    sessionId,
    onSelectSession: selectSession,
    active: frameActive && !chatCovered,
  });
  // Der Projektfilter gehoert zum Katalog: ein gewaehltes Projekt fragt die
  // Sitzungen genau dieses Projekts ab.
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const sidebar = useHermesV2Sidebar({
    ownerId,
    sessionId,
    active: frameActive,
    projectId: projectFilter,
  });

  // Wechsel in einen anderen Bereich entwertet lokale Details und Bestätigungen.
  const selectArea = useCallback((next: SelectableArea) => {
    setAreaState(next);
    setDeleteTarget(null);
  }, []);
  // Parking und Verdeckung entwerten die Deletefläche vollständig.
  useEffect(() => {
    if (!frameActive || !documentVisible) setDeleteTarget(null);
  }, [frameActive, documentVisible]);

  const openNewSession = useCallback(() => {
    selectArea("chat");
    setDrawerOpen(false);
    setNewSessionOpen(true);
  }, [selectArea, setDrawerOpen]);
  const closeNewSession = useCallback(() => setNewSessionOpen(false), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);
  const openSessions = useCallback(() => {
    if (compact) setDrawerOpen(true);
    else {
      setSidebarCollapsed(false);
      requestAnimationFrame(() => rootRef.current
        ?.querySelector<HTMLInputElement>(
          ".hermesv2-sidebar input[type='search']",
        )
        ?.focus());
    }
  }, [compact, rootRef, setDrawerOpen]);
  // Ein geöffneter mobiler Drawer liegt über der Fläche; darunter eintreffende
  // Antworten dürfen nicht automatisch gelesen werden.
  const chatReadActive =
    frameActive &&
    documentVisible &&
    area === "chat" &&
    !(compact && drawerOpen) &&
    !newSessionOpen &&
    !sidebarDialogOpen &&
    !deleteTarget &&
    !renameSessionId;
  const selectChatSession = chat.selectSession;
  // Umbenennen trifft die aktive Sitzung des Chats. Ein Wunsch aus der Spalte
  // wechselt deshalb zuerst in diese Sitzung; danach öffnet der Dialog.
  const requestRename = useCallback(
    (target: string) => {
      if (chat.activeSnapshot?.sessionId !== target) selectChatSession(target);
      setRenameSessionId(target);
    },
    [chat.activeSnapshot?.sessionId, selectChatSession],
  );
  const selectFromPanel = useCallback(
    (id: string) => {
      selectArea("chat");
      selectChatSession(id);
      if (compact) setDrawerOpen(false);
    },
    [selectChatSession, selectArea, compact, setDrawerOpen],
  );
  const deleteFromPanel = useCallback(
    (id: string) => {
      setDeleteTarget(id);
      if (compact) setDrawerOpen(false);
    },
    [compact, setDrawerOpen],
  );

  const resourceVisible =
    frameActive &&
    documentVisible &&
    !(compact && drawerOpen) &&
    !newSessionOpen &&
    !sidebarDialogOpen;
  // Ressourcenbereich: null, solange der Chat sichtbar ist; die Deletefläche
  // bindet als eigener Bereich. Überlagernde Ressourcen-Dialoge ändern das
  // nicht, ihre Aktionen bleiben gültig. Der Ressourcenhask lebt in der
  // eigenen Region und mountet nur, wenn wirklich eine Ressourcen- oder
  // Deletefläche sichtbar sein soll; der Chat-Renditepfad bleibt unberührt.
  const resourceArea = deleteActive
    ? ("session-delete" as const)
    : area === "chat" || area === "configuration"
      ? null
      : area;
  // Ressourcenregionen mounten nur echt: keine Mount-Emitschatten auf dem
  // Chatpfad; im Chat bleibt der Renderpfad ab dem Eigentum unberührt.

  const drawerId = useId();
  const className = [
    "hermesv2",
    `is-${variant}`,
    minimal ? "is-minimal" : "",
    drawerOpen ? "is-drawer-open" : "",
    sidebarCollapsed ? "is-sidebar-collapsed" : "",
    sidebarLayout.resizing ? "is-sidebar-resizing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sidebarHidden = compact ? !drawerOpen : sidebarCollapsed;
  return (
    <section
      ref={rootRef}
      className={className}
      style={sidebarLayout.style}
      onPointerDownCapture={(event) => { event.currentTarget.dataset.inputMode = "pointer"; }}
      onKeyDownCapture={(event) => { event.currentTarget.dataset.inputMode = "keyboard"; }}
      onKeyDown={(event) => { if (frameActive && !newSessionOpen && !renameSessionId && !sidebarDialogOpen && !deleteTarget) undoOrganization(event, sidebar); }}
      data-hermes-ui="v2"
      data-hermes-frame-active={frameActive ? "true" : "false"}
      data-hermes-panel-path={panel?.hermesAdminPath ?? undefined}
      data-hermes-area={areaMarker(area, deleteActive)}
    >
      {/* Sitzungsspalte in jeder Variante: breit inline, schmal als Drawer;
          Route, Panel und Standalone teilen dieselbe Spalte. */}
      <div
        ref={layerRef}
        className="hermesv2-drawer-layer"
        inert={sidebarHidden}
        role={modal ? "dialog" : undefined}
        aria-modal={modal || undefined}
        aria-label={modal ? "Hermes-V2-Sitzungen" : undefined}
      >
        <aside
          id={drawerId}
          className="hermesv2-sidebar"
          data-drawer-open={drawerOpen ? "true" : "false"}
          aria-label="Hermes-V2-Sitzungen"
          aria-hidden={sidebarHidden ? true : undefined}
        >
          <HermesV2SidebarBrand onClose={compact ? () => setDrawerOpen(false) : undefined} />
          <MemoSidebarPanel
            sidebar={sidebar}
            activeSessionId={sessionId}
            onSelect={selectFromPanel}
            onCreate={openNewSession}
            onDialogOpenChange={setSidebarDialogOpen}
            onDeleteSession={deleteFromPanel}
            onRenameSession={requestRename}
            projectId={projectFilter}
            onProjectChange={setProjectFilter}
          />
          <HermesV2SidebarFooter standalone={standalone} />
          {/* Die Bereichsauswahl sitzt ganz unten in der Spalte, unter der Chatliste. */}
          {!compact ? <HermesV2AreaNav area={area} onSelect={selectArea} /> : null}
        </aside>
        <div
          className="hermesv2-drawer-backdrop"
          data-drawer-open={drawerOpen ? "true" : "false"}
          aria-hidden="true"
          onPointerDown={() => setDrawerOpen(false)}
        />
      </div>
      {!compact && !sidebarCollapsed ? (
        <div className="hermesv2-sidebar-resize" {...sidebarLayout.separatorProps} aria-controls={drawerId} />
      ) : null}
      <div className="hermesv2-main">
        <HermesV2ChatHeader
          title={chat.activeSnapshot?.session?.title ?? null}
          area={area}
          sessionId={sessionId}
          standalone={standalone}
          drawerId={drawerId}
          sidebarExpanded={compact ? drawerOpen : !sidebarCollapsed}
          onToggleSidebar={() => compact ? setDrawerOpen((open) => !open) : setSidebarCollapsed((hidden) => !hidden)}
        />
        <div className="hermesv2-area">
          <div className="hermesv2-areabody">
            {deleteActive ? null : area === "chat" ? (
              <>
                <HermesV2ChatSurface
                  chat={chat}
                  active={frameActive}
                  variant={standalone ? "standalone" : variant}
                  onNewSession={openNewSession}
                  onOpenSessions={openSessions}
                  readView={sidebar.readView}
                  readActive={chatReadActive}
                />
              </>
            ) : area === "configuration" ? (
              <HermesV2ConfigurationArea active={enabled && resourceVisible} />
            ) : (
              <MemoResourceRegion
                ownerId={ownerId}
                enabled={enabled}
                active={frameActive}
                visible={resourceVisible}
                area={resourceArea}
                deleteSessionId={null}
                onDeleteClosed={closeDelete}
                onOpenSession={selectFromPanel}
              />
            )}
          </div>
        </div>
        {compact ? <HermesV2AreaNav area={area} onSelect={selectArea} compact onOverlayChange={setSidebarDialogOpen} /> : null}
        <HermesV2NewSessionDialog
          chat={chat}
          open={newSessionOpen}
          onClose={closeNewSession}
        />
        {renameSessionId ? (
          <HermesV2RenameDialog
            chat={chat}
            sessionId={renameSessionId}
            title={sidebar.rows.find((row) => row.id === renameSessionId)?.title ?? null}
            onClose={() => setRenameSessionId(null)}
          />
        ) : null}
        {deleteTarget ? (
          <MemoResourceRegion
            ownerId={ownerId}
            enabled={enabled}
            active={frameActive}
            visible={resourceVisible}
            area="session-delete"
            deleteSessionId={deleteTarget}
            onDeleteClosed={closeDelete}
          />
        ) : null}
      </div>
    </section>
  );
}
