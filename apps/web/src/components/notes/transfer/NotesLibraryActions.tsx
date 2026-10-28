import { NotesFolderActions } from "../sidebar/NotesFolderActions";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../lib/apiClient";
import { invalidateNoteSummaries } from "../noteQueryUpdates";
import { newNoteTitle } from "../noteTitles";
import { useDismissible } from "../hooks/useDismissible";
import { useNavigate } from "react-router";
import { notesWorkspacePath } from "../../../lib/notesRoutes";

const templates = {
  Idee: "## Gedanke\n\n\n## Nächster Schritt\n\n- [ ] ",
  Fehleranalyse: "## Beobachtung\n\n\n## Reproduktion\n\n1. \n\n## Ursache\n\n\n## Lösung\n\n",
  Entscheidung: "## Entscheidung\n\n\n## Gründe\n\n\n## Alternativen\n\n",
  Recherche: "## Fragestellung\n\n\n## Erkenntnisse\n\n\n## Quellen\n\n",
};
export function NotesLibraryActions() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const navigate = useNavigate();
  useDismissible({ open, onClose: () => setOpen(false), rootRef: root });
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null); setMessage(null); setOpen(false);
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Die Aktion konnte nicht ausgeführt werden."); }
    finally { setBusy(false); await invalidateNoteSummaries(client); }
  };
  return <div className="notes-library-actions" ref={root}>
    <button type="button" className="notes-library-trigger" aria-label="Notizablage verwalten" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>···</button>
    <div className="notes-library-menu" role="menu" hidden={!open}>
      <NotesFolderActions menuItem />
      <button type="button" role="menuitem" onClick={() => { setOpen(false); input.current?.click(); }}>Importieren …</button>
      <button type="button" role="menuitem" onClick={() => void run(async () => {
        const { exportNotes, downloadNotes } = await import("./exportNotes");
        downloadNotes(await exportNotes()); setMessage("Export erstellt, inklusive verfügbarer lokaler Anhänge.");
      })}>Alle Notizen exportieren</button>
      {Object.entries(templates).map(([name, content]) => <button type="button" role="menuitem" key={name} onClick={() => void run(async () => {
        const result = await apiClient.createNote({ title: `${name} · ${newNoteTitle()}` });
        if (!result) throw new Error("Seite konnte nicht angelegt werden.");
        const saved = await apiClient.saveNoteContent(result.note.id, { content, expectedRevision: result.note.revision });
        if (!saved || saved.status !== "saved") throw new Error("Vorlage konnte nicht gespeichert werden.");
        navigate(notesWorkspacePath(result.note.id));
      })}>Neue {name === "Entscheidung" ? "Entscheidung" : name === "Recherche" ? "Recherche" : name === "Idee" ? "Idee" : "Fehleranalyse"}</button>)}
    </div>
    <input ref={input} type="file" accept=".md,.zip" aria-label="Notizen importieren" hidden onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (file) void run(async () => {
        const { importNotes } = await import("./importNotes");
        const report = await importNotes(file);
        setMessage(`${report.created} Notizen importiert.${report.warnings.length ? " " + report.warnings.join(" ") : ""}`);
      });
    }} />
    {busy ? <p role="status">Notizen werden verarbeitet…</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p className="note-action-error" role="alert">{error}</p> : null}
  </div>;
}
