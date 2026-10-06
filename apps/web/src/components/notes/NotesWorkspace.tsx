import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Note, NoteSummary } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { notesWindowUrl, notesWorkspaceUrl } from "../../lib/notesRoutes";
import { wraptQueries } from "../../lib/queryOptions";
import { useNotesPreferences } from "../../stores/notesPreferences";
import { QueryBoundary } from "../QueryBoundary";
import { NoteEditor } from "./NoteEditor.js";
import type { NoteReferenceAppender } from "./NoteEditor.js";
import { appendNoteReferenceToPage } from "./editor/noteReferences.js";
import { NoteHeader } from "./NoteHeader.js";
import { NoteTitle } from "./NoteTitle.js";
import { NoteMobileNavigation } from "./NoteMobileNavigation.js";
import { NotesEmpty } from "./NotesEmpty.js";
import { useNotesMutations } from "./hooks/useNotesMutations.js";
import { NotesCommandPalette } from "./search/NotesCommandPalette.js";
import { NotesSidebar } from "./sidebar/NotesSidebar.js";
import type { NoteSaveState } from "./editor/useNoteAutosave.js";
import { useLastOpenedNote } from "./useLastOpenedNote.js";

interface NotesWorkspaceProps {
  noteId: string | null;
  onSelectNote: (noteId: string | null) => void;
  /** Eigenständiges Fenster: keine Seitenleiste, Sprung in die Übersicht. */
  windowMode?: boolean;
}

const NOTE_WINDOW_FEATURES = "popup=yes,noopener=yes,noreferrer=yes,width=1100,height=820";

export function NotesWorkspace({ noteId, onSelectNote, windowMode = false }: NotesWorkspaceProps) {
  const queryClient = useQueryClient();
  const listQuery = useQuery(wraptQueries.notesList());
  const notes = useMemo(() => listQuery.data?.notes ?? [], [listQuery.data]);

  const noteQuery = useQuery({
    ...wraptQueries.note(noteId ?? ""),
    enabled: noteId !== null,
  });

  const [saveState, setSaveState] = useState<NoteSaveState>("saved");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const editorReferenceAppenderRef = useRef<{ parentId: string; append: NoteReferenceAppender } | null>(null);
  const sidebarCollapsed = useNotesPreferences((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useNotesPreferences((state) => state.setSidebarCollapsed);
  // Unter 900px ist die Seitenleiste eine Schublade über dem Inhalt statt
  // einer Spalte daneben.
  const isDrawerSidebar = useMediaQuery("(max-width: 900px)");

  const showActionError = useCallback((message: string) => setActionError(message), []);

  const registerReferenceAppender = useCallback(
    (parentId: string, append: NoteReferenceAppender | null) => {
      if (append) editorReferenceAppenderRef.current = { parentId, append };
      else if (editorReferenceAppenderRef.current?.parentId === parentId) editorReferenceAppenderRef.current = null;
    },
    [],
  );

  const appendParentReference = useCallback(async (parentId: string, child: Note) => {
    const editorAppender = editorReferenceAppenderRef.current;
    try {
      if (editorAppender?.parentId === parentId) return await editorAppender.append(parentId, child);
      return await appendNoteReferenceToPage(parentId, child);
    } catch {
      return false;
    }
  }, []);

  const invalidateNotes = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
    [queryClient],
  );

  const { createMutation, patchMutation, moveMutation } = useNotesMutations({
    appendParentReference, invalidateNotes, showActionError, onSelectNote,
    closeMobileSidebar: () => setMobileSidebarOpen(false),
  });

  // Nach jedem eigenen Speichern den Detail-Cache frisch halten: Sonst würde
  // ein Wechsel zurück zur Seite den alten Stand zeigen (etwa einen gerade
  // eingefügten Seiten-Verweis).
  const handleEditorSaved = useCallback(
    (saved: Note) => {
      queryClient.setQueryData(["notes", "detail", saved.id], { note: saved });
      void invalidateNotes();
    },
    [invalidateNotes, queryClient],
  );

  const handleSelect = useCallback(
    (id: string) => {
      onSelectNote(id);
      setMobileSidebarOpen(false);
    },
    [onSelectNote],
  );

  const handleCreate = useCallback(
    (parentId: string | null = null, options: { folderId?: string | null; favorite?: boolean } = {}) => {
      createMutation.mutate({ parentId, ...options });
    },
    [createMutation],
  );

  const handleDuplicate = useCallback(
    (note: NoteSummary) => {
      void (async () => {
        try {
          const detail = await apiClient.note(note.id);
          if (!detail?.note) throw new Error("Seite nicht gefunden");
          const created = await apiClient.createNote({
            title: `${note.title} Kopie`,
            parentId: note.parentId,
            folderId: note.folderId ?? null,
          });
          if (!created?.note) throw new Error("Kopie konnte nicht erstellt werden");
          if (detail.note.content !== "") {
            await apiClient.saveNoteContent(created.note.id, {
              content: detail.note.content,
              expectedRevision: created.note.revision,
            });
          }
          if (detail.note.icon !== null) await apiClient.updateNote(created.note.id, { icon: detail.note.icon });
          void invalidateNotes();
          onSelectNote(created.note.id);
        } catch {
          void invalidateNotes();
          showActionError("Die Seite konnte nicht vollständig dupliziert werden.");
        }
      })();
    },
    [invalidateNotes, onSelectNote, showActionError],
  );

  const handleCopyLink = useCallback(
    (note: Note | NoteSummary) => {
      void navigator.clipboard
        .writeText(notesWorkspaceUrl(note.id))
        .catch(() => showActionError("Link konnte nicht kopiert werden."));
    },
    [showActionError],
  );

  const openWindow = useCallback((id: string) => {
    window.open(notesWindowUrl(id), `wrapt-note-${id}`, NOTE_WINDOW_FEATURES);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isDrawerSidebar) setMobileSidebarOpen((value) => !value);
    else setSidebarCollapsed(!sidebarCollapsed);
  }, [isDrawerSidebar, setSidebarCollapsed, sidebarCollapsed]);

  // Escape schließt die Schublade. Bewusst in der Bubble-Phase und ohne
  // stopPropagation: Offene Overlays (Palette, Menüs, Verschieben-Dialog)
  // verbrauchen Escape zuerst über ihre eigenen Dismiss-Handler.
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setMobileSidebarOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileSidebarOpen]);

  // Capture stellt sicher, dass ⌘K die Suche auch aus dem Editor heraus öffnet.
  useEffect(() => {
    if (windowMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        setPaletteOpen((value) => !value);
      } else if (meta && event.key === "\\") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        setSidebarCollapsed(!sidebarCollapsed);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [setSidebarCollapsed, sidebarCollapsed, windowMode]);

  // Ohne Auswahl die zuletzt geöffnete Seite wiederherstellen, sonst die oberste.
  useLastOpenedNote({ noteId, notes, windowMode, onSelectNote });

  const ancestors = useMemo(() => {
    const byId = new Map(notes.map((note) => [note.id, note]));
    const chain: NoteSummary[] = [];
    let current = noteId === null ? undefined : byId.get(noteId);
    const guard = new Set<string>();
    while (current?.parentId != null && !guard.has(current.parentId)) {
      guard.add(current.parentId);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      chain.push(parent);
      current = parent;
    }
    return chain;
  }, [notes, noteId]);

  const activeNote = noteQuery.data?.note ?? null;

  const archiveCurrent = useCallback(async () => {
    if (!activeNote) return;
    try {
      await patchMutation.mutateAsync({ noteId: activeNote.id, patch: { archived: true } });
      const remaining = notes.filter((note) => note.id !== activeNote.id && !note.archived);
      onSelectNote(remaining[0]?.id ?? null);
    } catch { /* onError zeigt die Rückmeldung und die Seite bleibt geöffnet. */ }
  }, [activeNote, notes, onSelectNote, patchMutation]);

  const toggleFavorite = useCallback(
    (note: Note | NoteSummary) => {
      patchMutation.mutate({ noteId: note.id, patch: { favorite: !note.favorite } });
    },
    [patchMutation],
  );

  const sidebarRendered = !windowMode;

  return (
    <div className="notes-workspace">
      {sidebarRendered ? (
        <NotesSidebar
          collapsed={sidebarCollapsed && !isDrawerSidebar}
          notes={notes}
          folders={listQuery.data?.folders ?? []}
          activeId={noteId}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onOpenPalette={() => {
            // Die Palette ist auf dem Handy bildschirmfüllend; die Schublade
            // darunter würde sonst Esc und den Fokus abfangen.
            setPaletteOpen(true);
            setMobileSidebarOpen(false);
          }}
          onSelect={handleSelect}
          onCreatePage={handleCreate}
          onPatch={(id, patch) => patchMutation.mutate({ noteId: id, patch })}
          onMove={(id, drop) => moveMutation.mutate({ noteId: id, drop })}
          onDuplicate={handleDuplicate}
          onCopyLink={handleCopyLink}
        />
      ) : null}
      {!windowMode && mobileSidebarOpen ? (
        <button
          type="button"
          className="notes-sidebar-backdrop"
          aria-label="Seitenleiste schließen"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}

      <div className="notes-main">
        {noteId === null ? (
          <NotesEmpty windowMode={windowMode} onCreate={() => handleCreate(null)} {...(!windowMode && (isDrawerSidebar || sidebarCollapsed) ? { onOpenSidebar: toggleSidebar } : {})} />
        ) : (
          <QueryBoundary
            isLoading={noteQuery.isPending}
            isError={noteQuery.isError}
            error={noteQuery.error}
            data={noteQuery.data}
            loadingLabel="Notiz wird geladen…"
            refetch={noteQuery.refetch}
          >
            {(data) =>
              data.note ? (
                <div className="notes-document">
                  <NoteHeader
                    note={data.note}
                    ancestors={ancestors}
                    saveState={saveState}
                    windowMode={windowMode}
                    sidebarCollapsed={sidebarCollapsed}
                    mobileSidebarOpen={mobileSidebarOpen}
                    onToggleSidebar={toggleSidebar}
                    onSelectAncestor={handleSelect}
                    onToggleFavorite={() => toggleFavorite(data.note)}
                    onArchive={archiveCurrent}
                    onCreateSubpage={() => handleCreate(data.note.id)}
                    onOpenWindow={() => openWindow(data.note.id)}
                    onCopyLink={() => handleCopyLink(data.note)}
                    onOpenOverview={() => window.location.assign(notesWorkspaceUrl(data.note.id))}
                  />
                  <div className="notes-editor-scroll">
                    <div className="notes-editor-frame">
                      {data.note.archived ? (
                        <div className="note-trash-banner" role="status">
                          <div>
                            <strong>Diese Seite liegt im Papierkorb.</strong>
                            <span>Wiederherstellen holt sie zurück in die Liste.</span>
                          </div>
                          <button
                            type="button"
                            className="quiet-button-primary"
                            onClick={() =>
                              patchMutation.mutate({ noteId: data.note.id, patch: { archived: false } })
                            }
                          >
                            Wiederherstellen
                          </button>
                        </div>
                      ) : null}
                      <NoteTitle
                        note={data.note}
                        onPatch={(patch) => patchMutation.mutate({ noteId: data.note.id, patch })}
                      />
                      <NoteEditor
                        key={data.note.id}
                        note={data.note}
                        onSaved={handleEditorSaved}
                        onStateChange={setSaveState}
                        onSubpageCreated={() => void invalidateNotes()}
                        onCreateSubpage={handleCreate}
                        onRegisterNoteReferenceAppender={registerReferenceAppender}
                        onOpenNote={handleSelect}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <NotesEmpty windowMode={windowMode} onCreate={() => handleCreate(null)} {...(!windowMode && (isDrawerSidebar || sidebarCollapsed) ? { onOpenSidebar: toggleSidebar } : {})} />
              )
            }
          </QueryBoundary>
        )}
        {!windowMode ? (
          <NoteMobileNavigation
            sidebarOpen={mobileSidebarOpen}
            onOpenPages={toggleSidebar}
            onSearch={() => { setMobileSidebarOpen(false); setPaletteOpen(true); }}
            onCreate={() => handleCreate(null)}
          />
        ) : null}
        {actionError !== null ? <p className="note-action-error" role="alert">{actionError}</p> : null}
      </div>

      {!windowMode ? (
        <NotesCommandPalette
          open={paletteOpen}
          notes={notes}
          onClose={() => setPaletteOpen(false)}
          onSelect={handleSelect}
          onOpenWindow={openWindow}
        />
      ) : null}
    </div>
  );
}
