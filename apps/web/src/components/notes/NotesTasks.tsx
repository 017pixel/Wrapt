import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NoteTask } from "@wrapt/contracts";
import { notesKnowledgeApi as api } from "../../lib/apiClient/notesKnowledge";
import { publishSavedNote } from "./noteQueryUpdates";
import { wraptQueries } from "../../lib/queryOptions";
import "./note-knowledge.css";

export function NotesTasks({ onSelect }: { onSelect: (id: string) => void }) {
  const client = useQueryClient();
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [project, setProject] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasks = useQuery({ queryKey: ["notes", "tasks"], queryFn: api.noteTasks });
  const projects = useQuery(wraptQueries.projects());
  const update = useMutation({
    mutationFn: async ({ task, checked, due }: { task: NoteTask; checked: boolean; due?: string | null }) => {
      const result = await api.setNoteTask(task.noteId, task.line, task.revision, checked, due);
      if (!result || result.status !== "saved") throw new Error("Die Notiz wurde zwischenzeitlich geändert. Deine Änderung wurde nicht übernommen.");
      return result.note;
    },
    onMutate: async ({ task, checked, due }) => {
      await client.cancelQueries({ queryKey: ["notes", "tasks"] });
      const previous = client.getQueryData<{ tasks: NoteTask[] }>(["notes", "tasks"]);
      client.setQueryData(["notes", "tasks"], previous ? { tasks: previous.tasks.map((item) => item.noteId === task.noteId && item.line === task.line ? { ...item, checked, ...(due === undefined ? {} : { due }) } : item) } : previous);
      return previous;
    },
    onSuccess: async (note) => { await publishSavedNote(client, note); setError(null); },
    onError: (reason: Error, _variables, previous) => { if (previous) client.setQueryData(["notes", "tasks"], previous); setError(reason.message); },
    onSettled: async (_data, _error, { task }) => {
      await client.invalidateQueries({ queryKey: ["notes", "tasks"] });
      setPending((current) => { const next = { ...current }; delete next[`${task.noteId}:${task.line}`]; return next; });
    },
  });
  const rows = tasks.data?.tasks.filter((task) => (!project || task.projectId === project) && (!onlyOpen || !task.checked)) ?? [];
  return <section className="notes-task-view">
    <h1>Aufgaben</h1><div className="notes-task-filters">
      <label><input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} /> Nur offene</label>
      <select aria-label="Aufgaben nach Projekt filtern" value={project} onChange={(event) => setProject(event.target.value)}><option value="">Alle Projekte</option>{projects.data?.projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
    </div>
    {tasks.isPending ? <p role="status">Aufgaben werden geladen…</p> : null}
    {tasks.isError ? <p role="alert">Aufgaben konnten nicht geladen werden. <button onClick={() => void tasks.refetch()}>Erneut versuchen</button></p> : null}
    {!tasks.isPending && !tasks.isError && rows.length === 0 ? <p>Keine Aufgaben. Checkboxen in deinen Notizen erscheinen hier.</p> : null}
    {rows.map((task) => <div className="notes-task-row" key={`${task.noteId}:${task.line}`}>
      <label><input type="checkbox" aria-label={task.text} checked={pending[`${task.noteId}:${task.line}`] ?? task.checked} disabled={update.isPending} onChange={(event) => { const checked = event.target.checked; setPending((current) => ({ ...current, [`${task.noteId}:${task.line}`]: checked })); update.mutate({ task, checked }); }} /><span className={task.checked ? "is-complete" : ""}>{task.text}</span></label>
      <button type="button" onClick={() => onSelect(task.noteId)}>{task.noteTitle}</button>
      <input type="date" aria-label={`Fälligkeit: ${task.text}`} value={task.due ?? ""} disabled={update.isPending} onChange={(event) => update.mutate({ task, checked: task.checked, due: event.target.value || null })} />
    </div>)}
    {error ? <p className="note-action-error" role="alert">{error}</p> : null}
  </section>;
}
