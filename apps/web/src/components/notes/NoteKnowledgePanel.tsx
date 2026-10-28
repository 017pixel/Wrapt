import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Note } from "@wrapt/contracts";
import { notesKnowledgeApi as api } from "../../lib/apiClient/notesKnowledge";
import { wraptQueries } from "../../lib/queryOptions";
import { publishSavedNote } from "./noteQueryUpdates";
import "./note-knowledge.css";

export function NoteKnowledgePanel({ note, onSelect, canRestore = true }: { note: Note; onSelect: (id: string) => void; canRestore?: boolean }) {
  const [previewLink, setPreviewLink] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  const metadata = useQuery({ queryKey: ["notes", "metadata", note.id], queryFn: () => api.noteMetadata(note.id), enabled: open });
  const backlinks = useQuery({ queryKey: ["notes", "backlinks", note.id, note.revision], queryFn: () => api.noteBacklinks(note.id), enabled: open });
  const history = useQuery({ queryKey: ["notes", "history", note.id, note.revision], queryFn: () => api.noteHistory(note.id), enabled: open });
  const projects = useQuery({ ...wraptQueries.projects(), enabled: open });
  const update = useMutation({
    mutationFn: api.setNoteMetadata.bind(null, note.id),
    onSuccess: (result) => { client.setQueryData(["notes", "metadata", note.id], result); setError(null); void client.invalidateQueries({ queryKey: ["notes", "tasks"] }); },
    onError: () => setError("Eigenschaften konnten nicht gespeichert werden."),
  });
  const restore = useMutation({
    mutationFn: async (entryId: number) => {
      const result = await api.restoreNoteVersion(note.id, entryId, note.revision);
      if (!result || result.status !== "saved") throw new Error("Konflikt");
      return result.note;
    },
    onSuccess: (saved) => { void publishSavedNote(client, saved); setSelectedVersion(null); setError(null); },
    onError: () => setError("Wiederherstellung nicht möglich. Bitte lade den aktuellen Stand neu."),
  });
  return <details className="note-knowledge" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Eigenschaften, Verknüpfungen und Verlauf</summary>
    {open ? <div className="note-knowledge-content">
      {metadata.data ? <>
        <label>Projekt<select aria-label="Projektzuordnung" value={metadata.data.metadata.projectId ?? ""} disabled={update.isPending} onChange={(event) => update.mutate({ ...metadata.data!.metadata, projectId: event.target.value || null })}>
          <option value="">Ohne Projekt</option>{projects.data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        <label>Tags<input aria-label="Notiz-Tags" defaultValue={metadata.data.metadata.tags.join(", ")} key={metadata.data.metadata.tags.join(",")} placeholder="Mit Komma trennen" maxLength={2400} onBlur={(event) => {
          const tags = [...new Set(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))];
          if (tags.join(",") !== metadata.data!.metadata.tags.join(",")) update.mutate({ ...metadata.data!.metadata, tags });
        }} /></label>
      </> : metadata.isError ? <p role="alert">Eigenschaften konnten nicht geladen werden.</p> : <p role="status">Eigenschaften werden geladen…</p>}
      <div><strong>Verknüpfte Notizen</strong>{backlinks.data?.notes.length === 0 ? <p>Keine Rückverweise.</p> : null}
        {backlinks.data?.notes.map((linked) => <div key={linked.id}><button type="button" aria-expanded={previewLink === linked.id} onClick={() => setPreviewLink(previewLink === linked.id ? null : linked.id)}>{linked.title}</button>{previewLink === linked.id ? <aside aria-label={`Vorschau: ${linked.title}`}><p>{linked.excerpt || "Leere Notiz"}</p><button type="button" onClick={() => onSelect(linked.id)}>Notiz öffnen</button></aside> : null}</div>)}
        {backlinks.isError ? <p role="alert">Verknüpfungen konnten nicht geladen werden.</p> : null}
      </div>
      <details><summary>Versionsverlauf</summary>
        {history.isPending ? <p role="status">Versionen werden geladen…</p> : null}
        {history.isError ? <p role="alert">Versionen konnten nicht geladen werden.</p> : null}
        {history.data?.entries.length === 0 ? <p>Noch keine frühere Version.</p> : null}
        {history.data?.entries.map((entry) => <div key={entry.id}>
          <button type="button" onClick={() => setSelectedVersion(selectedVersion === entry.id ? null : entry.id)}>{entry.title} · {new Date(entry.createdAt).toLocaleString("de-DE")}</button>
          {selectedVersion === entry.id ? <><pre className="note-history-preview">{entry.content || "Leere Seite"}</pre><button type="button" disabled={restore.isPending || !canRestore} onClick={() => restore.mutate(entry.id)}>Diese Version wiederherstellen</button></> : null}
        </div>)}
      </details>
      {error ? <p className="note-action-error" role="alert">{error}</p> : null}
    </div> : null}
  </details>;
}
