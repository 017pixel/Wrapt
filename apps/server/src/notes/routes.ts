import {
  createNoteRequestSchema,
  noteFolderRequestSchema,
  noteFolderUpdateSchema,
  noteFolderResponseSchema,
  moveNoteRequestSchema,
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
import { pluginRouteOperation, type PluginRouteOperations } from "../plugins/host-route.js";

const noteParamsSchema = z.object({ noteId: z.string().uuid() });

export async function registerNotesRoutes(
  app: FastifyInstance,
  services: { notes: NotesDatabase } & PluginRouteOperations,
) {
  const notFound = () => new AppError(404, "NOTE_NOT_FOUND", "Diese Notiz wurde nicht gefunden.");

  app.get("/notes", async (request) => pluginRouteOperation(services, request, "notes.list", undefined, () => notesListResponseSchema.parse({ notes: services.notes.list(), folders: services.notes.folders.list() })));

  app.post("/notes/folders", async (request, reply) => {
    const { name } = noteFolderRequestSchema.parse(request.body);
    return reply.status(201).send(await pluginRouteOperation(services, request, "noteFolders.create", { name }, () => noteFolderResponseSchema.parse({ folder: services.notes.folders.create(name) })));
  });
  app.patch("/notes/folders/:folderId", async (request) => {
    const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.params);
    const changes = noteFolderUpdateSchema.parse(request.body);
    return pluginRouteOperation(services, request, "noteFolders.update", { folderId, changes }, () => noteFolderResponseSchema.parse({ folder: services.notes.folders.update(folderId, changes) }));
  });
  app.delete("/notes/folders/:folderId", async (request, reply) => {
    const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.params);
    await pluginRouteOperation(services, request, "noteFolders.remove", { folderId }, () => services.notes.folders.remove(folderId));
    return reply.status(204).send();
  });

  app.get("/notes/search", async (request) => {
    const query = noteSearchQuerySchema.parse(request.query);
    return pluginRouteOperation(services, request, "notes.search", query, () => notesListResponseSchema.parse({ notes: services.notes.search(query) }));
  });

  app.post("/notes", async (request, reply) => {
    const input = createNoteRequestSchema.parse(request.body ?? {});
    return reply.status(201).send(await pluginRouteOperation(services, request, "notes.create", input, () => noteResponseSchema.parse({ note: services.notes.create(input) })));
  });

  app.get("/notes/:noteId", async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    return pluginRouteOperation(services, request, "notes.get", { noteId }, () => {
      const note = services.notes.get(noteId);
      if (!note) throw notFound();
      return noteResponseSchema.parse({ note });
    });
  });

  app.patch("/notes/:noteId", async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    const input = updateNoteRequestSchema.parse(request.body ?? {});
    return pluginRouteOperation(services, request, "notes.update", { noteId, changes: input }, () => noteResponseSchema.parse({ note: services.notes.update(noteId, input) }));
  });

  app.post("/notes/:noteId/move", async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    const changes = moveNoteRequestSchema.parse(request.body);
    return pluginRouteOperation(services, request, "notes.move", { noteId, changes }, () => noteResponseSchema.parse({ note: services.notes.move(noteId, changes) }));
  });

  app.put("/notes/:noteId/content", async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    const input = saveNoteContentRequestSchema.parse(request.body);
    const result = await pluginRouteOperation(services, request, "notes.saveContent", { noteId, changes: input }, () => services.notes.saveContent(noteId, input.content, input.expectedRevision));
    return saveNoteContentResponseSchema.parse(result);
  });

  app.delete("/notes/:noteId", async (request, reply) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    await pluginRouteOperation(services, request, "notes.archive", { noteId }, () => services.notes.archive(noteId));
    return reply.status(204).send();
  });

  app.post("/notes/:noteId/restore", async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    return pluginRouteOperation(services, request, "notes.restore", { noteId }, () => noteResponseSchema.parse({ note: services.notes.restore(noteId) }));
  });
}
