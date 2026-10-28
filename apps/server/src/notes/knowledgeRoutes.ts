import { z } from "zod";
import { noteBacklinksSchema, noteHistorySchema, noteKnowledgeResponseSchema, noteKnowledgeSchema, noteRestoreRequestSchema, noteTaskUpdateSchema, noteTasksSchema, saveNoteContentResponseSchema } from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../utils/errors.js";
import type { NotesDatabase } from "./database.js";
import { noteTasks, updateTaskLine } from "./tasks.js";

const paramsSchema = z.object({ noteId: z.string().uuid() });
export function registerNoteKnowledgeRoutes(app: FastifyInstance, notes: NotesDatabase) {
  const requireNote = (id: string) => {
    const note = notes.get(id);
    if (!note) throw new AppError(404, "NOTE_NOT_FOUND", "Diese Notiz wurde nicht gefunden.");
    return note;
  };
  const activeNotes = () => notes.list().filter((note) => !note.archived).map((note) => requireNote(note.id));
  app.get("/notes/tasks", async () => noteTasksSchema.parse({ tasks: activeNotes().flatMap((note) => noteTasks(note, notes.knowledge.metadata(note.id).projectId)) }));
  app.get("/notes/:noteId/metadata", async (request) => {
    const { noteId } = paramsSchema.parse(request.params); requireNote(noteId);
    return noteKnowledgeResponseSchema.parse({ metadata: notes.knowledge.metadata(noteId) });
  });
  app.put("/notes/:noteId/metadata", async (request) => {
    const { noteId } = paramsSchema.parse(request.params); requireNote(noteId);
    return noteKnowledgeResponseSchema.parse({ metadata: notes.knowledge.setMetadata(noteId, noteKnowledgeSchema.parse(request.body)) });
  });
  app.get("/notes/:noteId/backlinks", async (request) => {
    const { noteId } = paramsSchema.parse(request.params); requireNote(noteId);
    return noteBacklinksSchema.parse({ notes: notes.knowledge.backlinks(noteId, activeNotes()) });
  });
  app.get("/notes/:noteId/history", async (request) => {
    const { noteId } = paramsSchema.parse(request.params); requireNote(noteId);
    return noteHistorySchema.parse({ entries: notes.knowledge.history(noteId) });
  });
  app.post("/notes/:noteId/history/restore", async (request) => {
    const { noteId } = paramsSchema.parse(request.params);
    const body = noteRestoreRequestSchema.parse(request.body);
    const history = noteHistorySchema.parse({ entries: notes.knowledge.history(noteId) });
    const entry = history.entries.find((item) => item.id === body.entryId);
    if (!entry) throw new AppError(404, "NOTE_HISTORY_NOT_FOUND", "Diese Version wurde nicht gefunden.");
    const result = notes.saveContent(noteId, entry.content, body.expectedRevision);
    if (result.status === "saved") result.note = notes.update(noteId, { title: entry.title, expectedRevision: result.note.revision });
    return saveNoteContentResponseSchema.parse(result);
  });
  app.patch("/notes/:noteId/tasks/:line", async (request) => {
    const { noteId, line } = paramsSchema.extend({ line: z.coerce.number().int().nonnegative() }).parse(request.params);
    const body = noteTaskUpdateSchema.parse(request.body);
    const note = requireNote(noteId);
    if (!noteTasks(note, null).some((task) => task.line === line)) throw new AppError(400, "NOTE_TASK_NOT_FOUND", "Die Aufgabe wurde verändert. Bitte lade die Liste neu.");
    return saveNoteContentResponseSchema.parse(notes.saveContent(noteId, updateTaskLine(note.content, line, body.checked, body.due), body.expectedRevision));
  });
}
