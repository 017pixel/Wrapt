import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Rnd } from "react-rnd";
import { apiClient } from "../../../lib/apiClient";
import { notesWorkspacePath } from "../../../lib/notesRoutes";
import { wraptQueries } from "../../../lib/queryOptions";
import { NoteEditor } from "../NoteEditor";
import { NoteTitle } from "../NoteTitle";
import { noteSaveStateLabels, type NoteSaveState } from "../editor/useNoteAutosave";
import { publishSavedNote } from "../noteQueryUpdates";
import { NOTES_EDITOR_EVENT, fitNoteWindow, useQuickNote } from "./quickNoteState";

/** Nichtmodales Fenster: nur seine eigene Fläche fängt Zeiger und Tastatur ab. */
export default function QuickNoteWindow() {
  const { open, noteId, rect, focusRequest, close, setNoteId, setRect } = useQuickNote();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({ ...wraptQueries.note(noteId ?? ""), enabled: open && noteId !== null });
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<NoteSaveState>("saved");
  const [busy, setBusy] = useState(false);
  const creating = useRef(false);
  const titleSave = useRef<Promise<boolean>>(Promise.resolve(true));
  const focusBody = useRef<(() => void) | null>(null);
  const saveNow = useRef<(() => Promise<boolean>) | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const registerFocus = useCallback((focus: (() => void) | null) => { focusBody.current = focus; }, []);
  const registerSave = useCallback((save: (() => Promise<boolean>) | null) => { saveNow.current = save; }, []);

  const create = useCallback(async () => {
    if (creating.current) return;
    creating.current = true;
    setError(null);
    try {
      const result = await apiClient.createGlobalQuicknote();
      await publishSavedNote(client, result.note);
      setNoteId(result.note.id);
    } catch { setError("Notiz konnte nicht angelegt werden. Bitte erneut versuchen."); }
    finally { creating.current = false; }
  }, [client, setNoteId]);

  useEffect(() => {
    if (open && noteId === null) void create();
  }, [create, noteId, open]);
  useEffect(() => {
    const fit = () => setRect(fitNoteWindow(useQuickNote.getState().rect, { width: window.innerWidth, height: window.innerHeight }));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [setRect]);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusBody.current?.();
  }, [focusRequest, open]);

  useEffect(() => () => { document.body.classList.remove("is-moving-quick-note"); }, []);

  const dismiss = () => {
    document.body.classList.remove("is-moving-quick-note");
    close();
    if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
  };
  const expand = async () => {
    if (!noteId || !saveNow.current || busy) return;
    setBusy(true);
    try {
      if (!await titleSave.current) { setError("Der Titel konnte noch nicht gespeichert werden."); return; }
      if (!await saveNow.current()) { setError("Die Notiz bleibt hier geöffnet, bis sie gespeichert ist."); return; }
      window.dispatchEvent(new Event(NOTES_EDITOR_EVENT));
      navigate(notesWorkspacePath(noteId));
      close();
    } finally { setBusy(false); }
  };
  const note = query.data?.note;
  if (!open) return null;
  return createPortal(<div className="quick-note-layer">
    <Rnd className="quick-note-window" bounds="parent" position={{ x: rect.x, y: rect.y }} size={{ width: rect.width, height: rect.height }}
      minWidth={Math.min(280, window.innerWidth - 16)} minHeight={Math.min(240, window.innerHeight - 16)}
      dragHandleClassName="quick-note-titlebar" cancel="button,input,textarea" enableUserSelectHack
      onDragStart={() => document.body.classList.add("is-moving-quick-note")}
      onDragStop={(_event, position) => { document.body.classList.remove("is-moving-quick-note"); setRect({ ...rect, x: position.x, y: position.y }); }}
      onResizeStart={() => document.body.classList.add("is-moving-quick-note")}
      onResizeStop={(_event, _direction, element, _delta, position) => {
        document.body.classList.remove("is-moving-quick-note");
        setRect({ ...position, width: element.offsetWidth, height: element.offsetHeight });
      }}>
      <section className="quick-note-content" role="dialog" aria-modal="false" aria-label="Quick Note">
        <header className="quick-note-titlebar">
          <button type="button" aria-label="Im Notizen-Werkzeug öffnen" title="Im Notizen-Werkzeug öffnen" disabled={!note || busy} onClick={() => void expand()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6m0-6-7 7M3 15v6h6m-6 0 7-7" /></svg></button>
          <span tabIndex={0} role="group" aria-label="Fenster verschieben: Pfeiltasten; mit Shift Größe ändern" onKeyDown={(event) => {
            if (!event.key.startsWith("Arrow")) return;
            event.preventDefault();
            const dx = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
            const dy = event.key === "ArrowUp" ? -16 : event.key === "ArrowDown" ? 16 : 0;
            setRect(fitNoteWindow(event.shiftKey ? { ...rect, width: rect.width + dx, height: rect.height + dy } : { ...rect, x: rect.x + dx, y: rect.y + dy }, { width: window.innerWidth, height: window.innerHeight }));
          }} />
          <button type="button" aria-label="Quick Note schließen" title="Schließen, Entwurf behalten" onClick={dismiss}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg></button>
        </header>
        <div className="quick-note-scroll notes-editor-scroll">
          {note ? <>
            <NoteTitle draftScope="quick" note={note} onEnterBody={() => focusBody.current?.()} onPatch={(patch) => {
              titleSave.current = apiClient.updateNote(note.id, patch).then(async (result) => { if (!result) throw new Error("Speichern fehlgeschlagen"); await publishSavedNote(client, result.note); return true; }).catch(() => { setError("Titel konnte nicht gespeichert werden."); return false; });
            }} />
            <NoteEditor draftScope="quick" key={note.id} note={note} autoFocus showMobileToolbar={false} onSaved={(saved) => void publishSavedNote(client, saved)} onStateChange={setSaveState} onRegisterBodyFocus={registerFocus} onRegisterSave={registerSave} onOpenNote={(id) => navigate(notesWorkspacePath(id))} />
          </> : query.isError ? <p role="alert">Notiz konnte nicht geladen werden. <button onClick={() => void query.refetch()}>Erneut versuchen</button><button onClick={() => setNoteId(null)}>Neue Notiz</button></p>
            : noteId && !query.isPending ? <p>Diese Notiz existiert nicht mehr. <button onClick={() => setNoteId(null)}>Neue Notiz</button></p> : <p role="status">Notiz wird vorbereitet…</p>}
          {error ? <p className="note-action-error" role="alert">{error} <button onClick={() => noteId ? setError(null) : void create()}>Erneut versuchen</button></p> : null}
        </div>
        <footer className="quick-note-footer"><span role="status">{noteSaveStateLabels[saveState]}</span></footer>
      </section>
    </Rnd>
  </div>, document.body);
}
