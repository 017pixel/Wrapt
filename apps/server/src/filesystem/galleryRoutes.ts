import { createReadStream } from "node:fs";
import {
  createGalleryFolderRequestSchema,
  galleryFileListResponseSchema,
  galleryFileResponseSchema,
  galleryFolderListResponseSchema,
  galleryFolderResponseSchema,
  updateGalleryFileRequestSchema,
  updateGalleryFolderRequestSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteServices } from "../api/services.js";
import { AppError } from "../utils/errors.js";


const assetCursorSchema = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() });

function decodeAssetCursor(cursor: string | undefined, code: string, message: string) {
  if (!cursor) return null;
  try {
    return assetCursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new AppError(400, code, message);
  }
}

export async function registerGalleryRoutes(app: FastifyInstance, services: RouteServices) {
  app.post("/files", async (request, reply) => {
    const upload = await request.file();
    if (!upload) throw new AppError(400, "FILE_GALLERY_REQUIRED", "Bitte wähle eine Datei zum Hochladen aus.");
    const { folderId } = z.object({ folderId: z.string().uuid().optional() }).parse(request.query);
    const file = await services.fileGallery.createStream({ filename: upload.filename, mimeType: upload.mimetype, stream: upload.file, folderId: folderId ?? null });
    return reply.status(201).send(galleryFileResponseSchema.parse({ file }));
  });
  app.get("/files", async (request) => {
    const { limit, cursor, folderId } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), cursor: z.string().min(1).optional(), folderId: z.string().uuid().optional() }).parse(request.query);
    const decoded = decodeAssetCursor(cursor, "FILE_GALLERY_CURSOR_INVALID", "Der Cursor ist ungültig.");
    const page = services.fileGallery.list(limit, decoded, folderId ?? undefined);
    return galleryFileListResponseSchema.parse({ files: page.assets, nextCursor: page.nextCursor });
  });
  app.get("/files/folders", async () => galleryFolderListResponseSchema.parse({ folders: services.fileGallery.listFolders() }));
  app.post("/files/folders", async (request, reply) => {
    const input = createGalleryFolderRequestSchema.parse(request.body);
    const folder = services.fileGallery.createFolder(input.name);
    return reply.status(201).send(galleryFolderResponseSchema.parse({ folder }));
  });
  app.patch("/files/folders/:folderId", async (request) => {
    const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.params);
    const input = updateGalleryFolderRequestSchema.parse(request.body);
    const folder = services.fileGallery.updateFolder(folderId, input.name);
    if (!folder) throw new AppError(404, "FILE_GALLERY_FOLDER_NOT_FOUND", "Dieser Ordner wurde nicht gefunden.");
    return galleryFolderResponseSchema.parse({ folder });
  });
  app.delete("/files/folders/:folderId", async (request, reply) => {
    const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.params);
    const deleted = services.fileGallery.deleteFolder(folderId);
    if (!deleted) throw new AppError(404, "FILE_GALLERY_FOLDER_NOT_FOUND", "Dieser Ordner wurde nicht gefunden.");
    return reply.status(204).send();
  });
  app.get("/files/:fileId", async (request, reply) => {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const found = await services.fileGallery.file(fileId);
    if (!found) throw new AppError(404, "FILE_GALLERY_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
    reply.header("X-Content-Type-Options", "nosniff").header("Content-Security-Policy", "sandbox").type(found.asset.mimeType);
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(found.asset.filename)}`);
    return reply.send(createReadStream(found.path));
  });
  app.patch("/files/:fileId", async (request) => {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const input = updateGalleryFileRequestSchema.parse(request.body);
    const updates: { filename?: string; folderId?: string | null } = {};
    if (input.filename !== undefined) updates.filename = input.filename;
    if (input.folderId !== undefined) updates.folderId = input.folderId;
    const updated = await services.fileGallery.update(fileId, updates);
    if (!updated) throw new AppError(404, "FILE_GALLERY_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
    return galleryFileResponseSchema.parse({ file: updated });
  });
  app.delete("/files/:fileId", async (request, reply) => {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const deleted = await services.fileGallery.delete(fileId);
    if (!deleted) throw new AppError(404, "FILE_GALLERY_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
    return reply.status(204).send();
  });
}
