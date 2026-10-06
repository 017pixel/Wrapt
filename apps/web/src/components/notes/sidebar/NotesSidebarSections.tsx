import { useMemo } from "react";
import type { NoteFolder, NoteSummary, UpdateNoteRequest } from "@wrapt/contracts";
import { useNotesPreferences } from "../../../stores/notesPreferences.js";
import { NotesTree } from "./NotesTree.js";
import { NotesSidebarRow } from "./NotesSidebarRow.js";
import { NotesRecentSection } from "./NotesRecentSection.js";
import { NotesSection } from "./NotesSection.js";
import { NotesFolderActions } from "./NotesFolderActions.js";
import { NotesDragProvider, NOTE_DRAG_TYPE, useNotesDrag } from "./NotesDragContext.js";
import type { NotesDropResult } from "./treeDrop.js";

export interface NotesSidebarSectionsProps {
  notes: readonly NoteSummary[];
  folders: readonly NoteFolder[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreatePage: (parentId?: string | null, options?: { folderId?: string | null; favorite?: boolean }) => void;
  onPatch: (id: string, patch: UpdateNoteRequest) => void;
  onMove: (id: string, drop: NotesDropResult) => void;
  onOpenMenu: (note: NoteSummary, anchor: DOMRect) => void;
  renameRequestId: string | null;
  onRenameRequestHandled: () => void;
}

function SidebarSections(props: NotesSidebarSectionsProps) {
  const { notes, folders, activeId, onSelect, onCreatePage, onPatch, onMove, onOpenMenu } = props;
  const sectionOrder = useNotesPreferences((state) => state.sectionOrder);
  const favoriteOrder = useNotesPreferences((state) => state.favoriteOrder);
  const moveFavorite = useNotesPreferences((state) => state.moveFavorite);
  const drag = useNotesDrag();
  const active = useMemo(() => notes.filter((note) => !note.archived), [notes]);
  const favorites = active.filter((note) => note.favorite).sort((a, b) => {
    const left = favoriteOrder.indexOf(a.id), right = favoriteOrder.indexOf(b.id);
    return (left < 0 ? favoriteOrder.length : left) - (right < 0 ? favoriteOrder.length : right) || a.sortOrder - b.sortOrder;
  });
  const trashed = notes.filter((note) => note.archived);
  const treeProps = {
    activeId, onSelect, onPatch, onMove, onOpenMenu, allNotes: active,
    onCreateSubpage: (parentId: string) => onCreatePage(parentId),
    renameRequestId: props.renameRequestId, onRenameRequestHandled: props.onRenameRequestHandled,
  };
  const dropInFolder = (id: string, folderId: string | null) => {
    if (!active.some((note) => note.id === id)) return;
    onMove(id, { parentId: null, folderId, sortOrder: Math.max(0, ...active.map((note) => note.sortOrder)) + 1 });
  };
  const groups = new Map<string, React.ReactNode>();
  groups.set("recent", <NotesRecentSection notes={notes} activeId={activeId} onSelect={onSelect} onOpenMenu={onOpenMenu} />);
  groups.set("favorites", <NotesSection id="favorites" title="Favoriten" onCreate={() => onCreatePage(null, { favorite: true })}
    onDropNote={(id) => { if (active.some((note) => note.id === id)) onPatch(id, { favorite: true }); }}>
    {favorites.map((note) => <div key={note.id} draggable data-favorite-id={note.id}
      onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData(NOTE_DRAG_TYPE, note.id); event.dataTransfer.effectAllowed = "move"; drag.setNoteId(note.id); }}
      onDragEnd={() => drag.setNoteId(null)} onDragOver={(event) => { if (drag.noteId && drag.noteId !== note.id) event.preventDefault(); }}
      onDrop={(event) => {
        const id = event.dataTransfer.getData(NOTE_DRAG_TYPE);
        if (!active.some((entry) => entry.id === id) || id === note.id) return;
        event.preventDefault(); event.stopPropagation();
        onPatch(id, { favorite: true }); moveFavorite(id, note.id, favorites.map((entry) => entry.id)); drag.setNoteId(null);
      }}>
      <NotesSidebarRow note={note} active={note.id === activeId} onSelect={() => onSelect(note.id)} onOpenMenu={onOpenMenu} />
    </div>)}
    {!favorites.length ? <p className="notes-group-empty">Noch keine Favoriten.</p> : null}
  </NotesSection>);
  groups.set("all", <NotesSection id="all" title="Alle Notizen" onCreate={() => onCreatePage(null)} onDropNote={(id) => dropInFolder(id, null)}>
    <NotesTree notes={active} {...treeProps} />
  </NotesSection>);
  for (const folder of folders) {
    const byId = new Map(active.map((note) => [note.id, note]));
    const members = active.filter((note) => {
      const seen = new Set<string>();
      let root = note;
      while (root.parentId && byId.has(root.parentId) && !seen.has(root.parentId)) {
        seen.add(root.parentId); root = byId.get(root.parentId)!;
      }
      return root.folderId === folder.id;
    });
    groups.set(`folder:${folder.id}`, <NotesSection id={`folder:${folder.id}`} title={folder.name}
      onCreate={() => onCreatePage(null, { folderId: folder.id })} onDropNote={(id) => dropInFolder(id, folder.id)}
      actions={<NotesFolderActions folder={folder} />}>
      <NotesTree notes={members} {...treeProps} />
    </NotesSection>);
  }
  if (trashed.length) groups.set("trash", <NotesSection id="trash" title={`Papierkorb (${trashed.length})`}>
    {trashed.map((note) => <NotesSidebarRow key={note.id} note={note} active={note.id === activeId} onSelect={() => onSelect(note.id)}
      action={<button type="button" className="notes-sidebar-row-action" aria-label={`${note.title} wiederherstellen`} onClick={() => onPatch(note.id, { archived: false })}>Wiederherstellen</button>} />)}
  </NotesSection>);
  const order = [...sectionOrder.filter((id) => groups.has(id)), ...[...groups.keys()].filter((id) => !sectionOrder.includes(id))];
  return <>{order.map((id) => <div key={id}>{groups.get(id)}</div>)}</>;
}

export function NotesSidebarSections(props: NotesSidebarSectionsProps) {
  return <NotesDragProvider><SidebarSections {...props} /></NotesDragProvider>;
}
