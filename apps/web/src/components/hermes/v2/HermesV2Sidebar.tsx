import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "../../icons";
import { projectsApi } from "../../../lib/apiClient/projects";
import type {
  HermesV2Sidebar,
  SidebarGroupView,
  SidebarProjectChoice,
  SidebarShelf,
} from "./sidebar-types";
import { HermesV2SidebarShelf } from "./HermesV2SidebarShelf";
import { HermesV2SidebarTools } from "./HermesV2SidebarTools";
import { HermesV2SnoozeSheet } from "./HermesV2SnoozeSheet";
import type { RowCommand } from "./sidebar-row-commands";
import {
  isLocalCollapsible,
  MAIN_LIST_SHELF,
  MEMBER_SHELVES,
  SHELF_ORDER,
} from "./sidebar-format";
import { rowsOfProject, shelvesForMode, type SidebarViewMode } from "./sidebar-view";
import "./hermes-v2-sidebar.css";

export interface HermesV2SidebarPanelProps {
  sidebar: HermesV2Sidebar;
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onDialogOpenChange?: (open: boolean) => void;
  /** Natives Sessiondelete: öffnet die Bestätigungsfläche der Shell. */
  onDeleteSession?: (sessionId: string) => void;
  /** Umbenennen der aktiven Sitzung; der Dialog liegt beim Aufrufer. */
  onRenameSession?: (sessionId: string) => void;
  /**
   * Projektfilter. Ohne diese Props filtert die Spalte nur die bereits
   * geladenen Zeilen; mit ihnen fragt der Katalog das gewaehlte Projekt ab.
   */
  projectId?: string | null;
  onProjectChange?: (projectId: string | null) => void;
}

const DROP_TARGETS = new Set<SidebarShelf>(["pinned", "active", "settled"]);

/**
 * Echte Hermes-V2-Sidebar: Eingabe nötig vor den zuletzt benutzten Chats,
 * die übrigen Shelfs mit Zähler, Haarlinie und Chevron im unteren Dock.
 * Ehrliche Teilabdeckung der Suche, Menü- und Tastaturalternativen für jede
 * Geste, Undo-Fenster und Zurückstellen-Sheet. Busy sperrt jede Aktion
 * synchron; Mutationen werden nie automatisch wiederholt.
 */
export function HermesV2SidebarPanel({
  sidebar,
  activeSessionId,
  onSelect,
  onCreate,
  onDialogOpenChange,
  onDeleteSession,
  onRenameSession,
  projectId: controlledProjectId,
  onProjectChange,
}: HermesV2SidebarPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const undoHandle = sidebar.undoView?.handle;
  useEffect(() => {
    // Beim Gruppenwechsel wird der auslösende Zeilenknopf entfernt. Der
    // Fokus bleibt in Hermes, damit Strg+Z auch direkt danach ankommt.
    if (undoHandle && document.activeElement === document.body
      && !panelRef.current?.closest('[data-hermes-frame-active="false"]')) {
      panelRef.current?.focus({ preventScroll: true });
    }
  }, [undoHandle]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mode, setMode] = useState<SidebarViewMode>("all");
  const [localProjectId, setLocalProjectId] = useState<string | null>(null);
  const projectId = controlledProjectId ?? localProjectId;
  const setProjectId = onProjectChange ?? setLocalProjectId;
  // Die Projektauswahl enthaelt die bekannten Projekte des Nutzers. Der
  // Hermes-Katalog kennt nur die Projekte, nach denen gefragt wurde; ohne
  // diese Liste waere die Auswahl leer.
  const [knownProjects, setKnownProjects] = useState<SidebarProjectChoice[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    projectsApi
      .projects(controller.signal)
      .then((result) => {
        setKnownProjects(
          result.projects.map((project) => ({
            id: project.id,
            label: project.name,
          })),
        );
      })
      .catch(() => {
        // Ohne Projekte bleibt die Auswahl beim bestaetigten Bestand.
      });
    return () => controller.abort();
  }, []);
  const [localCollapsed, setLocalCollapsed] = useState<Partial<Record<SidebarShelf, boolean>>>({});
  const [snoozeTarget, setSnoozeTarget] = useState<{
    sessionId: string;
    revision: number;
  } | null>(null);
  const closeSnooze = useCallback(() => {
    setSnoozeTarget(null);
    onDialogOpenChange?.(false);
  }, [onDialogOpenChange]);
  const busyIds = useMemo(
    () => new Set(sidebar.busySessionIds),
    [sidebar.busySessionIds],
  );

  const onCommand = useCallback(
    (command: RowCommand) => {
      if (command.type === "delete") {
        // Die Bestätigung gehört zur Shell; Menü schließt synchron.
        onDeleteSession?.(command.sessionId);
        return;
      }
      if (command.type === "snooze") {
        onDialogOpenChange?.(true);
        setSnoozeTarget({
          sessionId: command.sessionId,
          revision: command.expectedRevision,
        });
        return;
      }
      // Sperre synchron: eine laufende Aktion derselben Sitzung blockiert neue.
      const sessionId =
        command.type === "organize"
          ? command.intent.sessionId
          : command.plan.allowed
            ? command.plan.kind === "action"
              ? command.plan.command.sessionId
              : (command.plan.command.entries[0]?.sessionId ?? null)
            : null;
      if (sessionId && busyIds.has(sessionId)) return;
      if (command.type === "organize") void sidebar.organize(command.intent);
      else void sidebar.executeDrop(command.plan);
    },
    [sidebar, busyIds, onDialogOpenChange, onDeleteSession],
  );

  const loadMoreFor = useCallback(
    (shelf: SidebarShelf) => {
      if (shelf === "pinned") void sidebar.preparePinnedReorder();
      else if (shelf === "snoozed" || shelf === "settled")
        void sidebar.loadMembers(shelf);
    },
    [sidebar],
  );

  const groups = useMemo(() => {
    const order = new Map(SHELF_ORDER.map((id, index) => [id, index]));
    const allowed = shelvesForMode(mode);
    return sidebar.groups
      .filter((group) => !allowed || allowed.includes(group.id))
      .map((group) => {
        if (projectId === null) return group;
        const rows = rowsOfProject(group.rows, projectId);
        return { ...group, rows, count: rows.length };
      })
      .sort(
        (a, b) =>
          (order.get(a.id) ?? SHELF_ORDER.length) -
          (order.get(b.id) ?? SHELF_ORDER.length),
      );
  }, [sidebar.groups, mode, projectId]);

  const mainList = groups.find((group) => group.id === MAIN_LIST_SHELF) ?? null;
  const attention = groups.find((group) => group.id === "needs-input");
  const shelves = groups.filter((group) => group.id !== MAIN_LIST_SHELF && group.id !== "needs-input");
  // "Mehr laden" gehört zu der Liste, die es nachlädt: die Shelfs mit eigener
  // Mitgliederliste bieten es, solange ihre Liste unvollständig ist.
  const loadMoreVisible = useCallback(
    (group: SidebarGroupView): boolean =>
      MEMBER_SHELVES.includes(group.id)
      && (group.id === "settled" || (group.hasMore && !group.complete)),
    [],
  );
  // Eingeklappt wird gemerkt: die Shelfs mit eigener Voreinstellung behalten
  // ihren Zustand in den Einstellungen, die übrigen nur in dieser Sitzung.
  const isCollapsed = useCallback(
    (id: SidebarShelf): boolean => {
      if (id === MAIN_LIST_SHELF) return false;
      if (isLocalCollapsible(id)) return localCollapsed[id] === true;
      return sidebar.collapsed[id] === true;
    },
    [localCollapsed, sidebar.collapsed],
  );
  const toggleCollapsed = useCallback(
    (id: SidebarShelf, collapsed: boolean) => {
      if (id === MAIN_LIST_SHELF) return;
      if (isLocalCollapsible(id)) {
        setLocalCollapsed((previous) => ({ ...previous, [id]: collapsed }));
        return;
      }
      sidebar.setCollapsed(id, collapsed);
    },
    [sidebar],
  );

  const search = sidebar.search;
  const searching = search.query.trim().length > 0;
  // "Mehr laden" steht nur noch bei der Liste, zu der es gehört: unten in der
  // Hauptliste, wenn der Katalog wirklich weitere Seiten hat.
  const canLoadMore = search.hasMore && search.nextOffset !== null;
  const empty =
    !sidebar.loading && groups.every((group) => group.rows.length === 0);
  // Das Dock der Shelfs steht unten. Ohne sichtbaren Shelf bleibt es leer -
  // beim Ziehen bleibt es offen, damit ein leerer Shelf ein Ziel sein kann.
  const dockEmpty =
    draggingId === null
    && shelves.every(
      (group) => group.rows.length === 0 && !loadMoreVisible(group),
    );

  return (
    <div ref={panelRef} className="hermesv2-sessionpanel" tabIndex={-1}>
      <div className="hermesv2-sidebar-searchbar">
        <label className="hermesv2-search-field">
          <SearchIcon aria-hidden style={{ color: "currentColor" }} />
          <input
            type="search"
            className="hermesv2-session-search"
            value={search.query}
            onChange={(event) => sidebar.setQuery(event.target.value)}
            placeholder="Suchen"
            aria-label="Sitzungen nach Titel, Kennung und Projekt suchen"
          />
        </label>
        <HermesV2SidebarTools
          projects={[
            ...knownProjects,
            ...sidebar.projects.filter(
              (entry) => !knownProjects.some((known) => known.id === entry.id),
            ),
          ]}
          mode={mode}
          projectId={projectId}
          onModeChange={setMode}
          onProjectChange={setProjectId}
          onCreate={onCreate}
        />
      </div>
      {searching ? (
        <p className="hermesv2-search-state" role="status">
          {search.loading
            ? "Suche läuft…"
            : `${search.loadedCount} Treffer${search.partial ? " — Suche deckt nur geladene Seiten ab" : ""}${search.limitReached ? " — Suchtiefe erreicht" : ""}`}
        </p>
      ) : null}
      {sidebar.error ? (
        <div className="hermesv2-action-error" role="alert">
          <p>{sidebar.error.message}</p>
          <button
            type="button"
            className="quiet-button"
            onClick={sidebar.clearError}
          >
            Schließen
          </button>
        </div>
      ) : null}
      <div className="hermesv2-shelves">
        {attention ? (
          <HermesV2SidebarShelf
            group={attention}
            activeSessionId={activeSessionId}
            busyIds={busyIds}
            collapsible
            droppable={false}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            collapsed={isCollapsed(attention.id)}
            onToggleCollapsed={(collapsed) => toggleCollapsed(attention.id, collapsed)}
            planDrop={sidebar.planDrop}
            onExecuteDrop={(plan) => void sidebar.executeDrop(plan)}
            onCommand={onCommand}
            onSelect={onSelect}
            deleteEnabled={onDeleteSession !== undefined}
            onRenameSession={onRenameSession}
          />
        ) : null}
        {mainList ? (
          <HermesV2SidebarShelf
            variant="list"
            group={mainList}
            activeSessionId={activeSessionId}
            busyIds={busyIds}
            collapsible={false}
            droppable={DROP_TARGETS.has(mainList.id) && draggingId !== null}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            collapsed={false}
            onToggleCollapsed={() => undefined}
            planDrop={sidebar.planDrop}
            onExecuteDrop={(plan) => void sidebar.executeDrop(plan)}
            onCommand={onCommand}
            onSelect={onSelect}
            onLoadMore={canLoadMore ? () => void sidebar.loadMore() : undefined}
            loadMoreVisible={canLoadMore}
            deleteEnabled={onDeleteSession !== undefined}
            onRenameSession={onRenameSession}
          />
        ) : null}
        {sidebar.loading &&
        sidebar.groups.every((group) => group.rows.length === 0) ? (
          <div className="hermesv2-sidebar-skeleton" role="status" aria-label="Sitzungen werden geladen">
            <span /><span /><span />
          </div>
        ) : null}
        {empty ? (
          <p className="hermesv2-sidebar-empty">
            {searching || mode !== "all" || projectId !== null
              ? "Keine passenden Chats."
              : "Deine Chats erscheinen hier."}
          </p>
        ) : null}
      </div>
      <div className="hermesv2-shelf-dock" data-empty={dockEmpty ? "true" : undefined}>
        {shelves.map((group) => (
          <HermesV2SidebarShelf
            key={group.id}
            group={group}
            activeSessionId={activeSessionId}
            busyIds={busyIds}
            collapsible
            droppable={DROP_TARGETS.has(group.id) && draggingId !== null}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            collapsed={isCollapsed(group.id)}
            onToggleCollapsed={(collapsed) => toggleCollapsed(group.id, collapsed)}
            planDrop={sidebar.planDrop}
            onExecuteDrop={(plan) => void sidebar.executeDrop(plan)}
            onCommand={onCommand}
            onSelect={onSelect}
            onLoadMore={
              MEMBER_SHELVES.includes(group.id)
                ? () => loadMoreFor(group.id)
                : undefined
            }
            loadMoreVisible={loadMoreVisible(group)}
            deleteEnabled={onDeleteSession !== undefined}
            onRenameSession={onRenameSession}
          />
        ))}
      </div>
      {snoozeTarget ? (
        <HermesV2SnoozeSheet
          sidebar={sidebar}
          sessionId={snoozeTarget.sessionId}
          expectedRevision={snoozeTarget.revision}
          open
          onClose={closeSnooze}
        />
      ) : null}
    </div>
  );
}
