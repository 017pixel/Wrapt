import { useCallback, useId, useRef, useState } from "react";
import { ChevronDownIcon } from "../../icons";
import type {
  SidebarDropPlan,
  SidebarDropTarget,
  SidebarGroupView,
} from "./sidebar-types";
import { HermesV2SidebarRow } from "./HermesV2SidebarRow";
import type { RowCommand } from "./sidebar-row-commands";
import { MAIN_LIST_SHELF, SHELF_LABELS, SHELF_LOAD_LABELS } from "./sidebar-format";

/** Ein Shelf zeigt höchstens so viele Zeilen, bis „Mehr anzeigen" folgt. */
const VISIBLE_ROWS = 5;

export interface HermesV2SidebarShelfProps {
  group: SidebarGroupView;
  /** "list" ist die namenlose Hauptliste der zuletzt benutzten Chats. */
  variant?: "shelf" | "list";
  activeSessionId: string | null;
  busyIds: ReadonlySet<string>;
  collapsible: boolean;
  droppable: boolean;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  planDrop: (
    sessionId: string,
    target: SidebarDropTarget,
    beforeSessionId?: string,
  ) => SidebarDropPlan;
  onExecuteDrop: (plan: SidebarDropPlan) => void;
  onCommand: (command: RowCommand) => void;
  onSelect: (sessionId: string) => void;
  /** Nächste Seite der eigenen Mitgliederliste laden. */
  onLoadMore?: (() => void) | undefined;
  /** Der Shelf bietet "Mehr laden" an, weil seine Liste weitere Seiten hat. */
  loadMoreVisible?: boolean;
  /** Natives Sessiondelete über den Menübefehl der Zeile. */
  deleteEnabled?: boolean;
  /** Umbenennen der aktiven Sitzung. */
  onRenameSession?: ((sessionId: string) => void) | undefined;
}

const DRAGGABLE_SHELVES = new Set(["pinned", "active", "snoozed", "settled"]);

/**
 * Beschriftete Shelf-Sektion: Name mit Zähler, eine lange Haarlinie und der
 * Chevron am rechten Rand. Kein Rahmen, kein Kasten, keine Fläche. Die
 * Hauptliste ("list") trägt keinen Namen und keinen Kopf.
 */
export function HermesV2SidebarShelf({
  group,
  variant = "shelf",
  activeSessionId,
  busyIds,
  collapsible,
  droppable,
  draggingId,
  setDraggingId,
  collapsed,
  onToggleCollapsed,
  planDrop,
  onExecuteDrop,
  onCommand,
  onSelect,
  onLoadMore,
  loadMoreVisible = false,
  deleteEnabled = false,
  onRenameSession,
}: HermesV2SidebarShelfProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [limit, setLimit] = useState(VISIBLE_ROWS);
  const uid = useId();
  const headingId = `hermesv2-shelf${uid}`;
  const isList = variant === "list";
  // Aktive Auswahl bleibt trotz Collapse erreichbar: genau die ausgewählte
  // Row bleibt sichtbar, ohne sie doppelt anzuzeigen.
  const hidden = collapsible && collapsed;
  const visibleRows = hidden
    ? group.rows.filter((row) => row.id === activeSessionId)
    : group.rows;
  // Eingeklappt und ohne ausgewählte Row: der Inhalt fährt vollständig weg.
  const listHidden = hidden && visibleRows.length === 0;
  const shownRows = visibleRows.slice(0, limit);
  const moreLoaded = visibleRows.length > shownRows.length;
  const label = group.id === MAIN_LIST_SHELF ? "" : SHELF_LABELS[group.id];
  const accent = group.id === "needs-input";
  const showLoadMore = loadMoreVisible && Boolean(onLoadMore);
  // Ein Shelf ohne Zeilen wird nicht gezeigt - auch nicht, solange er lädt.
  const isEmpty = group.rows.length === 0 && !showLoadMore && !droppable;
  // Der Ladehinweis gehört nur zum ersten Laden und nur in einem sichtbaren
  // Shelf. Eine Hintergrundaktualisierung behält die Zeilen und zeigt nichts.
  const showLoading = group.loading && group.rows.length === 0 && !isEmpty;

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!droppable || !draggingId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropActive(true);
    },
    [droppable, draggingId],
  );

  const onDragLeave = useCallback(() => setDropActive(false), []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      setDropActive(false);
      if (!droppable || !draggingId) return;
      event.preventDefault();
      const beforeSessionId =
        group.id === "pinned"
          ? beforeIdAtPoint(sectionRef.current, event.clientY)
          : undefined;
      const plan = planDrop(
        draggingId,
        group.id as SidebarDropTarget,
        beforeSessionId,
      );
      setDraggingId(null);
      if (plan.allowed) onExecuteDrop(plan);
      // Nicht erlaubte Drops zeigen den Grund über den Fehlerweg der Sidebar
      // nicht zusätzlich an: planDrop.allowed=false hat eine verständliche reason.
    },
    [droppable, draggingId, group.id, planDrop, onExecuteDrop, setDraggingId],
  );

  return (
    <section
      ref={sectionRef}
      className="hermesv2-shelf"
      data-hermes-shelf={group.id}
      data-variant={variant}
      data-collapsed={hidden ? "true" : "false"}
      data-drop-active={dropActive ? "true" : "false"}
      data-empty={isEmpty ? "true" : undefined}
      aria-labelledby={isList ? undefined : headingId}
      aria-label={isList ? "Zuletzt benutzte Chats" : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isList ? null : (
        <h3
          className="hermesv2-shelf-title"
          id={headingId}
          data-accent={accent ? "true" : "false"}
        >
          <button
            type="button"
            className="hermesv2-shelf-collapse"
            aria-expanded={!hidden}
            aria-controls={listHidden ? undefined : `${headingId}-list`}
            onClick={() => onToggleCollapsed(!hidden)}
          >
            <span className="hermesv2-shelf-label">{label}</span>
            {group.count > 0 ? (
              <span className="hermesv2-shelf-count">
                {" "}({group.count})
              </span>
            ) : null}
            <span className="hermesv2-shelf-rule" aria-hidden="true" />
            <ChevronDownIcon
              className="h-4 w-4 hermesv2-shelf-chevron"
              data-collapsed={hidden ? "true" : "false"}
              aria-hidden
            />
          </button>
        </h3>
      )}
      <div
        className="hermesv2-shelf-body"
        data-collapsed={listHidden ? "true" : "false"}
      >
        <div className="hermesv2-shelf-body-inner">
          {listHidden ? null : (
            <>
              <ul id={`${headingId}-list`} className="hermesv2-shelf-list">
                {shownRows.map((row, index) => (
                  <HermesV2SidebarRow
                    key={row.id}
                    row={row}
                    active={row.id === activeSessionId}
                    busy={busyIds.has(row.id)}
                    neighbors={{
                      previousId:
                        index > 0 ? (shownRows[index - 1]?.id ?? null) : null,
                      nextId:
                        index < shownRows.length - 1
                          ? (shownRows[index + 1]?.id ?? null)
                          : null,
                      planDrop,
                    }}
                    onCommand={onCommand}
                    onSelect={onSelect}
                    deleteEnabled={deleteEnabled}
                    onRenameSession={onRenameSession}
                    draggable={
                      DRAGGABLE_SHELVES.has(row.group) && !busyIds.has(row.id)
                    }
                    dragging={draggingId === row.id}
                    setDraggingId={setDraggingId}
                  />
                ))}
              </ul>
              {moreLoaded ? (
                <button
                  type="button"
                  className="quiet-button hermesv2-shelf-more"
                  onClick={() => setLimit((value) => value + VISIBLE_ROWS)}
                >
                  Mehr anzeigen
                </button>
              ) : null}
              {showLoadMore ? (
                <button
                  type="button"
                  className="quiet-button hermesv2-shelf-more"
                  onClick={onLoadMore}
                >
                  {SHELF_LOAD_LABELS[group.id] ?? "Mehr laden"}
                </button>
              ) : null}
              {showLoading ? (
                <p className="hermesv2-shelf-loading" role="status">
                  Lädt…
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Einfügepunkt in Pinned: erste Zeile, deren Mitte unter dem Cursor liegt. */
function beforeIdAtPoint(
  section: HTMLElement | null,
  y: number,
): string | undefined {
  if (!section) return undefined;
  const rows = section.querySelectorAll<HTMLElement>(
    ".hermesv2-rowitem[data-session-id]",
  );
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return row.dataset.sessionId;
  }
  return undefined;
}
