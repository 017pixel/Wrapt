import {
  createNoteRequestSchema,
  noteResponseSchema,
  noteSearchQuerySchema,
  notesListResponseSchema,
  saveNoteContentRequestSchema,
  saveNoteContentResponseSchema,
  updateNoteRequestSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../utils/errors.js";
import type { NotesDatabase } from "./database.js";

const noteParamsSchema = z.object({ noteId: z.string().uuid() });

export async function registerNotesRoutes(
  app: FastifyInstance,
  services: { notes: NotesDatabase },
) {
  const notFound = () => new AppError(404, "NOTE_NOT_FOUND", "Diese Notiz wurde nicht gefunden.");

  app.get("/notes", async () => notesListResponseSchema.parse({ notes: services.notes.list() }));

  app.get("/notes/search", async (request) => {
    const query = noteSearchQuerySchema.parse(request.query);
    return notesListResponseSchema.parse({ notes: services.notes.search(query) });
  });

  app.post("/notes", async (request, reply) => {
    const input = createNoteRequestSchema.parse(request.body ?? {});
    return reply.status(201).send(noteResponseSchema.parse({ note: services.notes.create(input) }));
  });

  app.get("/notes/:noteId", async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    const note = services.notes.get(noteId);
    if (!note) throw notFound();
    return noteResponseSchema.parse({ note });
  });

  app.patch("/notes/:noteId", async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    const input = updateNoteRequestSchema.parse(request.body ?? {});
    return noteResponseSchema.parse({ note: services.notes.update(noteId, input) });
  });

  app.put("/notes/:noteId/content", async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    const input = saveNoteContentRequestSchema.parse(request.body);
    const result = services.notes.saveContent(noteId, input.content, input.expectedRevision);
    return saveNoteContentResponseSchema.parse(result);
  });

  app.delete("/notes/:noteId", async (request, reply) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    services.notes.archive(noteId);
    return reply.status(204).send();
  });

  app.post("/notes/:noteId/restore", async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    return noteResponseSchema.parse({ note: services.notes.restore(noteId) });
  });
}
