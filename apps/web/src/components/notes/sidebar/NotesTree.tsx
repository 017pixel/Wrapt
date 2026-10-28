import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { NoteSummary, UpdateNoteRequest } from "@wrapt/contracts";
import { useNotesDrag } from "./NotesDragContext.js";
import { useNotesPreferences } from "../../../stores/notesPreferences.js";
import { NotesTreeItem, type NotesTreeActions } from "./NotesTreeItem.js";
import { buildSidebarTree, type SidebarTreeNode } from "./sidebarTree.js";
import { resolveNotesDrop, type NotesDropResult, type NotesDropZone } from "./treeDrop.js";
import { NotesCollapse } from "./NotesCollapse.js";

interface NotesTreeProps {
  notes: readonly NoteSummary[];
  allNotes?: readonly NoteSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateSubpage: (parentId: string) => void;
  onPatch: (noteId: string, patch: UpdateNoteRequest) => void;
  onMove: (noteId: string, drop: NotesDropResult) => void;
  onOpenMenu: (note: NoteSummary, anchor: DOMRect) => void;
  renameRequestId: string | null;
  onRenameRequestHandled: () => void;
}

/** Seitenbaum mit Auf-/Einklappen, Umbenennen, Kontextmenü und Ziehen. */
export function NotesTree({
  notes,
  allNotes = notes,
  activeId,
  onSelect,
  onCreateSubpage,
  onPatch,
  onMove,
  onOpenMenu,
  renameRequestId,
  onRenameRequestHandled,
}: NotesTreeProps) {
  const expanded = useNotesPreferences((state) => state.expanded);
  const toggleExpanded = useNotesPreferences((state) => state.toggleExpanded);
  const expandNotes = useNotesPreferences((state) => state.expandNotes);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const drag = useNotesDrag();
  const [localDraggingId, setDraggingId] = useState<string | null>(null);
  const draggingId = drag.noteId ?? localDraggingId;
  const [dropTarget, setDropTarget] = useState<{ noteId: string; zone: NotesDropZone } | null>(null);
  const expandTimerRef = useRef<number | null>(null);

  const tree = useMemo(() => buildSidebarTree(notes), [notes]);
  const byId = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);

  // Beim Öffnen einer Notiz den Pfad aufklappen, damit sie sichtbar ist.
  useEffect(() => {
    if (activeId === null) return;
    const chain: string[] = [];
    let current = byId.get(activeId);
    const guard = new Set<string>();
    while (current?.parentId != null && !guard.has(current.parentId)) {
      guard.add(current.parentId);
      chain.push(current.parentId);
      current = byId.get(current.parentId);
    }
    if (chain.length > 0) expandNotes(chain);
  }, [activeId, byId, expandNotes]);

  useEffect(() => {
    if (renameRequestId === null) return;
    setRenamingId(renameRequestId);
    const ancestors: string[] = [];
    let current = byId.get(renameRequestId);
    const guard = new Set<string>();
    while (current?.parentId != null && !guard.has(current.parentId)) {
      guard.add(current.parentId);
      ancestors.push(current.parentId);
      current = byId.get(current.parentId);
    }
    if (ancestors.length > 0) expandNotes(ancestors);
    onRenameRequestHandled();
  }, [expandNotes, byId, onRenameRequestHandled, renameRequestId]);

  const clearExpandTimer = useCallback(() => {
    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearExpandTimer, [clearExpandTimer]);

  const zoneFor = useCallback(
    (event: DragEvent<HTMLDivElement>, noteId: string): NotesDropZone | null => {
      if (draggingId === null) return null;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientY - rect.top) / rect.height;
      // Mittlerer Streifen verschachtelt, oben/unten ordnet als Geschwister ein.
      const zone: NotesDropZone = ratio > 0.25 && ratio < 0.75 ? "inside" : ratio < 0.5 ? "before" : "after";
      return resolveNotesDrop(allNotes, draggingId, noteId, zone) === null ? null : zone;
    },
    [draggingId, allNotes],
  );

  const handleDragOverRow = useCallback(
    (event: DragEvent<HTMLDivElement>, noteId: string) => {
      const zone = zoneFor(event, noteId);
      if (zone === null) {
        setDropTarget(null);
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget((current) =>
        current?.noteId === noteId && current.zone === zone ? current : { noteId, zone },
      );
      clearExpandTimer();
      if (zone === "inside" && expanded[noteId] !== true) {
        expandTimerRef.current = window.setTimeout(() => {
          expandTimerRef.current = null;
          expandNotes([noteId]);
        }, 600);
      }
    },
    [clearExpandTimer, expandNotes, expanded, zoneFor],
  );

  const handleDropRow = useCallback(
    (event: DragEvent<HTMLDivElement>, noteId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const zone = zoneFor(event, noteId);
      const dragId = draggingId;
      clearExpandTimer();
      setDropTarget(null);
      setDraggingId(null);
      if (dragId === null || zone === null) return;
      const result = resolveNotesDrop(allNotes, dragId, noteId, zone);
      if (result !== null) onMove(dragId, result);
    },
    [clearExpandTimer, draggingId, allNotes, onMove, zoneFor],
  );

  const actions: NotesTreeActions = useMemo(
    () => ({
      onToggle: (noteId) => toggleExpanded(noteId),
      onSelect: (noteId) => onSelect(noteId),
      onCreateSubpage: (parentId) => onCreateSubpage(parentId),
      onStartRename: (noteId) => setRenamingId(noteId),
      onCommitRename: (noteId, title) => {
        setRenamingId(null);
        onPatch(noteId, { title });
      },
      onCancelRename: () => setRenamingId(null),
      onOpenMenu,
      onDragStart: (noteId) => { setDraggingId(noteId); drag.setNoteId(noteId); },
      onDragEnd: () => {
        clearExpandTimer();
        setDraggingId(null);
        drag.setNoteId(null);
        setDropTarget(null);
      },
      onDragOverRow: handleDragOverRow,
      onDropRow: handleDropRow,
    }),
    [drag, clearExpandTimer, handleDragOverRow, handleDropRow, onOpenMenu, onPatch, onCreateSubpage, onSelect, toggleExpanded],
  );

  const renderNode = (node: SidebarTreeNode, depth: number) => {
    const isExpanded = expanded[node.note.id] === true;
    return (
      <NotesTreeItem
        key={node.note.id}
        note={node.note}
        depth={depth}
        hasChildren={node.children.length > 0}
        expanded={isExpanded}
        active={node.note.id === activeId}
        renaming={renamingId === node.note.id}
        dragging={draggingId === node.note.id}
        dropZone={dropTarget?.noteId === node.note.id ? dropTarget.zone : null}
        actions={actions}
      >
        {node.children.length > 0 ? (
          <NotesCollapse collapsed={!isExpanded} className="notes-tree-children">
            {() => node.children.map((child) => renderNode(child, depth + 1))}
          </NotesCollapse>
        ) : null}
      </NotesTreeItem>
    );
  };

  if (tree.length === 0) {
    return <p className="notes-group-empty">Noch keine Seiten.</p>;
  }

  return (
    <div className="notes-tree" onKeyDown={(event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest(".notes-tree-main")) return;
      const main = event.target.closest<HTMLButtonElement>(".notes-tree-main")!;
      const visible = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".notes-tree-main")].filter((button) => !button.closest("[inert]"));
      const position = visible.indexOf(main);
      const toggle = main.closest(".notes-tree-row")?.querySelector<HTMLButtonElement>(".notes-tree-toggle:not(.is-placeholder)");
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const target = event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : Math.max(0, Math.min(visible.length - 1, position + (event.key === "ArrowDown" ? 1 : -1)));
        visible[target]?.focus();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();
        else if (toggle) visible[position + 1]?.focus();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (toggle?.getAttribute("aria-expanded") === "true") toggle.click();
        else main.closest(".notes-tree-node")?.parentElement?.closest(".notes-tree-node")?.querySelector<HTMLButtonElement>(".notes-tree-main")?.focus();
      }
    }}>
      {tree.map((node) => renderNode(node, 0))}
    </div>
  );
}
