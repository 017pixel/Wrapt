import type { FastifyInstance } from "fastify";
import { NOTES_ARCHIVE_MAX_BYTES, notesArchiveSchema, notesImportResponseSchema } from "@wrapt/contracts";
import type { NotesDatabase } from "./database.js";
import { AppError } from "../utils/errors.js";

export function registerNoteTransferRoutes(app: FastifyInstance, notes: NotesDatabase) {
  app.get("/notes/export", async () => {
    const listing = notes.list();
    if (listing.length > 1000) throw new AppError(400, "NOTE_EXPORT_LIMIT", "Pro Export sind höchstens 1.000 Notizen möglich.");
    return notesArchiveSchema.parse({ version: 1, folders: notes.folders.list(),
      notes: listing.map((note) => notes.get(note.id)),
      metadata: Object.fromEntries(listing.map((note) => [note.id, notes.knowledge.metadata(note.id)])), assets: {},
    });
  });
  app.post("/notes/import", { bodyLimit: NOTES_ARCHIVE_MAX_BYTES }, async (request) => {
    const archive = notesArchiveSchema.parse(request.body);
    return notesImportResponseSchema.parse(notes.importArchive(archive));
  });
}
