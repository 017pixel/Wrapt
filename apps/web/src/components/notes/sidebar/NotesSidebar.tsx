import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { NoteFolder, NoteSummary, UpdateNoteRequest } from "@wrapt/contracts";
import {
  NOTES_SIDEBAR_DEFAULT_WIDTH,
  NOTES_SIDEBAR_MAX_WIDTH,
  NOTES_SIDEBAR_MIN_WIDTH,
  useNotesPreferences,
} from "../../../stores/notesPreferences.js";
import { useMediaQuery } from "../../../lib/useMediaQuery.js";
import { ChevronLeftIcon, PlusIcon, SearchIcon } from "../../icons";
import { NotesSidebarSections } from "./NotesSidebarSections.js";
import { NotesFolderActions } from "./NotesFolderActions.js";
import { NotesItemMenu } from "./NotesItemMenu.js";
import { NotesMoveDialog } from "./NotesMoveDialog.js";
import { PromptDialog } from "../../ModalDialog.js";
import type { NotesDropResult } from "./treeDrop.js";

interface NotesSidebarProps {
  collapsed: boolean;
  notes: readonly NoteSummary[];
  folders: readonly NoteFolder[];
  activeId: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenPalette: () => void;
  onSelect: (noteId: string) => void;
  onCreatePage: (parentId?: string | null, options?: { folderId?: string | null; favorite?: boolean }) => void;
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
  folders,
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
  const setSidebarWidth = useNotesPreferences((state) => state.setSidebarWidth);
  const setSidebarCollapsed = useNotesPreferences((state) => state.setSidebarCollapsed);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [moveNote, setMoveNote] = useState<NoteSummary | null>(null);
  const [renameNote, setRenameNote] = useState<NoteSummary | null>(null);
  const resizingRef = useRef(false);
  // Unter 900px liegt die Leiste als Schublade über dem Inhalt. Geschlossen
  // darf sie weder fokussierbar noch für Screenreader sichtbar sein.
  const isDrawer = useMediaQuery("(max-width: 900px)");
  const drawerClosed = isDrawer && !mobileOpen;
  const hidden = drawerClosed || collapsed;

  const active = notes.filter((note) => !note.archived);

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
  const clearRenameRequest = useCallback(() => undefined, []);

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
        <NotesFolderActions />
      </div>

      <div className="notes-sidebar-scroll">
        <NotesSidebarSections notes={notes} folders={folders} activeId={activeId} onSelect={handleSelect}
          onCreatePage={onCreatePage} onPatch={onPatch} onMove={onMove} onOpenMenu={openMenu}
          renameRequestId={null} onRenameRequestHandled={clearRenameRequest} />
      </div>

      {menu ? (
        <NotesItemMenu
          note={menu.note}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onSelect={handleSelect}
          onCreateSubpage={(parentId) => onCreatePage(parentId)}
          onRename={(noteId) => setRenameNote(notes.find((note) => note.id === noteId) ?? null)}
          onMove={(note) => setMoveNote(note)}
          onToggleFavorite={(note) => onPatch(note.id, { favorite: !note.favorite })}
          onDuplicate={onDuplicate}
          onCopyLink={onCopyLink}
          onArchive={(note) => onPatch(note.id, { archived: true })}
        />
      ) : null}

      <PromptDialog open={renameNote !== null} title="Seite umbenennen" label="Seitentitel"
        initialValue={renameNote?.title ?? ""} confirmLabel="Umbenennen" onClose={() => setRenameNote(null)}
        onConfirm={(title) => { if (renameNote) onPatch(renameNote.id, { title }); setRenameNote(null); }} />
      {moveNote ? (
        <NotesMoveDialog
          note={moveNote}
          notes={active}
          folders={folders}
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
