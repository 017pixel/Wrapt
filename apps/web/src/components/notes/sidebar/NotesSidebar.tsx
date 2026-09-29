import { useCallback, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { NoteSummary, UpdateNoteRequest } from "@wrapt/contracts";
import {
  NOTES_SIDEBAR_DEFAULT_WIDTH,
  NOTES_SIDEBAR_MAX_WIDTH,
  NOTES_SIDEBAR_MIN_WIDTH,
  useNotesPreferences,
} from "../../../stores/notesPreferences.js";
import { useMediaQuery } from "../../../lib/useMediaQuery.js";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from "../../icons";
import { NotesRecentSection } from "./NotesRecentSection.js";
import { NotesSidebarRow } from "./NotesSidebarRow.js";
import { NotesTree } from "./NotesTree.js";
import { NotesItemMenu } from "./NotesItemMenu.js";
import { NotesMoveDialog } from "./NotesMoveDialog.js";
import type { NotesDropResult } from "./treeDrop.js";

interface NotesSidebarProps {
  collapsed: boolean;
  notes: readonly NoteSummary[];
  activeId: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenPalette: () => void;
  onSelect: (noteId: string) => void;
  onCreatePage: (parentId?: string | null) => void;
  onPatch: (noteId: string, patch: UpdateNoteRequest) => void;
  onMove: (noteId: string, drop: NotesDropResult) => void;
  onDuplicate: (note: NoteSummary) => void;
  onCopyLink: (note: NoteSummary) => void;
}

interface MenuState {
  note: NoteSummary;
  anchor: DOMRect;
}

/**
 * Seitenleiste im Notion-Aufbau: Suche, Zuletzt verwendet, Favoriten,
 * Seitenbaum und Papierkorb. Breite ist ziehbar, die Leiste einklappbar.
 */
export function NotesSidebar({
  collapsed,
  notes,
  activeId,
  mobileOpen,
  onCloseMobile,
  onOpenPalette,
  onSelect,
  onCreatePage,
  onPatch,
  onMove,
  onDuplicate,
  onCopyLink,
}: NotesSidebarProps) {
  const width = useNotesPreferences((state) => state.sidebarWidth);
  const collapsedSections = useNotesPreferences((state) => state.collapsedSections);
  const setSidebarWidth = useNotesPreferences((state) => state.setSidebarWidth);
  const setSidebarCollapsed = useNotesPreferences((state) => state.setSidebarCollapsed);
  const toggleSection = useNotesPreferences((state) => state.toggleSection);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [moveNote, setMoveNote] = useState<NoteSummary | null>(null);
  const [renameRequestId, setRenameRequestId] = useState<string | null>(null);
  const resizingRef = useRef(false);
  // Unter 900px liegt die Leiste als Schublade über dem Inhalt. Geschlossen
  // darf sie weder fokussierbar noch für Screenreader sichtbar sein.
  const isDrawer = useMediaQuery("(max-width: 900px)");
  const drawerClosed = isDrawer && !mobileOpen;
  const hidden = drawerClosed || collapsed;

  const active = useMemo(() => notes.filter((note) => !note.archived), [notes]);
  const favorites = useMemo(() => active.filter((note) => note.favorite), [active]);
  const trashed = useMemo(() => notes.filter((note) => note.archived), [notes]);

  const handleSelect = useCallback(
    (noteId: string) => {
      onSelect(noteId);
      onCloseMobile();
    },
    [onCloseMobile, onSelect],
  );

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      resizingRef.current = true;
      const startX = event.clientX;
      const startWidth = width;
      const onMovePointer = (moveEvent: PointerEvent) => {
        setSidebarWidth(startWidth + (moveEvent.clientX - startX));
      };
      const stop = () => {
        resizingRef.current = false;
        window.removeEventListener("pointermove", onMovePointer);
        window.removeEventListener("pointerup", stop);
        document.body.classList.remove("is-resizing-notes-sidebar");
      };
      window.addEventListener("pointermove", onMovePointer);
      window.addEventListener("pointerup", stop);
      document.body.classList.add("is-resizing-notes-sidebar");
    },
    [setSidebarWidth, width],
  );

  const resizeBy = useCallback(
    (delta: number) => setSidebarWidth(width + delta),
    [setSidebarWidth, width],
  );

  const openMenu = useCallback((note: NoteSummary, anchor: DOMRect) => {
    setMenu({ note, anchor });
  }, []);
  const clearRenameRequest = useCallback(() => setRenameRequestId(null), []);

  return (
    <aside
      className={`notes-sidebar ${mobileOpen ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
      style={{ width: collapsed ? 0 : width }}
      aria-label="Notizen"
      inert={hidden ? true : undefined}
      aria-hidden={hidden ? true : undefined}
    >
      <div className="notes-sidebar-head">
        <button type="button" className="notes-search-row" onClick={onOpenPalette}>
          <SearchIcon aria-hidden />
          <span className="notes-search-row-label">Suchen…</span>
          <kbd className="notes-search-row-kbd">⌘K</kbd>
        </button>
        <div className="notes-sidebar-tools">
          <button type="button" className="notes-sidebar-new" onClick={() => onCreatePage(null)}>
            <PlusIcon aria-hidden /> Neue Seite
          </button>
          <button
            type="button"
            className="notes-sidebar-collapse"
            aria-label={isDrawer ? "Seitenleiste schließen" : "Seitenleiste einklappen"}
            title={isDrawer ? "Schließen" : "Einklappen (⌘\\)"}
            onClick={() => {
              if (isDrawer) onCloseMobile();
              else setSidebarCollapsed(true);
            }}
          >
            <ChevronLeftIcon aria-hidden />
          </button>
        </div>
      </div>

      <div className="notes-sidebar-scroll">
        <NotesRecentSection notes={notes} activeId={activeId} onSelect={handleSelect} onOpenMenu={openMenu} />

        {favorites.length > 0 ? (
          <section className="notes-group">
            <div className="notes-group-head">
              <button
                type="button"
                id="notes-favorites-heading"
                className="notes-group-toggle"
                aria-expanded={!collapsedSections.favorites}
                aria-controls="notes-favorites-list"
                onClick={() => toggleSection("favorites")}
              >
                <span>Favoriten</span>
                {collapsedSections.favorites ? <ChevronRightIcon aria-hidden /> : <ChevronDownIcon aria-hidden />}
              </button>
            </div>
            <div id="notes-favorites-list" aria-labelledby="notes-favorites-heading" hidden={collapsedSections.favorites}>
              {favorites.map((note) => (
                <NotesSidebarRow
                  key={note.id}
                  note={note}
                  active={note.id === activeId}
                  onSelect={() => handleSelect(note.id)}
                  onOpenMenu={openMenu}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="notes-group">
          <div className="notes-group-head">
            <button
              type="button"
              id="notes-private-heading"
              className="notes-group-toggle"
              aria-expanded={!collapsedSections.private}
              aria-controls="notes-private-list"
              onClick={() => toggleSection("private")}
            >
              <span>Privat</span>
              {collapsedSections.private ? <ChevronRightIcon aria-hidden /> : <ChevronDownIcon aria-hidden />}
            </button>
            <button
              type="button"
              className="notes-group-action"
              aria-label="Neue Seite in Privat"
              title="Neue Seite"
              onClick={() => onCreatePage(null)}
            >
              <PlusIcon aria-hidden />
            </button>
          </div>
          <div id="notes-private-list" aria-labelledby="notes-private-heading" hidden={collapsedSections.private}>
            <NotesTree
              notes={active}
              activeId={activeId}
              onSelect={handleSelect}
              onCreateSubpage={(parentId) => onCreatePage(parentId)}
              onPatch={onPatch}
              onMove={onMove}
              onOpenMenu={openMenu}
              renameRequestId={renameRequestId}
              onRenameRequestHandled={clearRenameRequest}
            />
          </div>
        </section>

        {trashed.length > 0 ? (
          <section className="notes-group">
            <div className="notes-group-head">
              <button
                type="button"
                id="notes-trash-heading"
                className="notes-group-toggle"
                aria-expanded={!collapsedSections.trash}
                aria-controls="notes-trash-list"
                onClick={() => toggleSection("trash")}
              >
                <span>Papierkorb ({trashed.length})</span>
                {collapsedSections.trash ? <ChevronRightIcon aria-hidden /> : <ChevronDownIcon aria-hidden />}
              </button>
            </div>
            <div
              id="notes-trash-list"
              aria-labelledby="notes-trash-heading"
              hidden={collapsedSections.trash}
            >
              {trashed.map((note) => (
                <NotesSidebarRow
                  key={note.id}
                  note={note}
                  active={note.id === activeId}
                  onSelect={() => handleSelect(note.id)}
                  action={
                    <button
                      type="button"
                      className="notes-sidebar-row-action"
                      aria-label={`${note.title} wiederherstellen`}
                      title="Wiederherstellen"
                      onClick={() => onPatch(note.id, { archived: false })}
                    >
                      Wiederherstellen
                    </button>
                  }
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {menu ? (
        <NotesItemMenu
          note={menu.note}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onSelect={handleSelect}
          onCreateSubpage={(parentId) => onCreatePage(parentId)}
          onRename={(noteId) => setRenameRequestId(noteId)}
          onMove={(note) => setMoveNote(note)}
          onToggleFavorite={(note) => onPatch(note.id, { favorite: !note.favorite })}
          onDuplicate={onDuplicate}
          onCopyLink={onCopyLink}
          onArchive={(note) => onPatch(note.id, { archived: true })}
        />
      ) : null}
      {moveNote ? (
        <NotesMoveDialog
          note={moveNote}
          notes={active}
          onClose={() => setMoveNote(null)}
          onMove={onMove}
        />
      ) : null}

      <div
        className="notes-sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Breite der Seitenleiste ändern"
        aria-valuemin={NOTES_SIDEBAR_MIN_WIDTH}
        aria-valuemax={NOTES_SIDEBAR_MAX_WIDTH}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={startResize}
        onDoubleClick={() => setSidebarWidth(NOTES_SIDEBAR_DEFAULT_WIDTH)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") resizeBy(-16);
          if (event.key === "ArrowRight") resizeBy(16);
        }}
      />
    </aside>
  );
}
