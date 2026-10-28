import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mediaAssetResponseSchema } from "@wrapt/contracts";
import type { RouteServices } from "../api/services.js";
import { settings } from "../config/settings.js";
import { AppError } from "../utils/errors.js";
import { legacyMediaFile } from "./legacyMedia.js";

export async function registerMediaRoutes(app: FastifyInstance, services: RouteServices) {
  app.post("/media", async (request, reply) => {
    const upload = await request.file({ limits: { fileSize: settings.fileGalleryMaxFileBytes } });
    if (!upload) throw new AppError(400, "MEDIA_REQUIRED", "Bitte wähle eine Datei aus.");
    const asset = await services.fileGallery.createStream({ filename: upload.filename, mimeType: upload.mimetype, stream: upload.file });
    return reply.status(201).send(mediaAssetResponseSchema.parse({ asset }));
  });
  app.get("/media/:assetId", async (request, reply) => {
    const { assetId } = z.object({ assetId: z.uuid() }).parse(request.params);
    const found = await services.fileGallery.file(assetId)
      ?? await legacyMediaFile(settings.databasePath, settings.legacyMediaDirectory, assetId);
    if (!found) throw new AppError(404, "MEDIA_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
    return reply.header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "sandbox")
      .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(found.asset.filename)}`)
      .type(found.asset.mimeType).send(createReadStream(found.path));
  });
}
