import { z } from "zod";

/**
 * Orbit-Assets und Dateigalerie. Eigenes Modul, damit `index.ts` als
 * historisch gewachsene Sammeldatei nicht weiter wächst.
 */

// Datumsformat bewusst lokal: kein Import aus index.ts, damit kein Zyklus
// zwischen den Vertragsmodulen entsteht.
const assetDateSchema = z.iso.datetime({ offset: true });

export const orbitAssetSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  bytes: z.number().int().nonnegative(),
  createdAt: assetDateSchema,
  folderId: z.string().uuid().nullable().default(null),
});
export const orbitAssetResponseSchema = z.object({ asset: orbitAssetSchema });
export const orbitAssetListResponseSchema = z.object({
  assets: z.array(orbitAssetSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const galleryFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  createdAt: assetDateSchema,
  fileCount: z.number().int().nonnegative().default(0),
});
export const galleryFolderResponseSchema = z.object({ folder: galleryFolderSchema });
export const galleryFolderListResponseSchema = z.object({
  folders: z.array(galleryFolderSchema),
});
export const createGalleryFolderRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const updateGalleryFolderRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const updateGalleryFileRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

// Die Dateigalerie teilt sich das Metadaten-Format mit den Orbit-Assets
// (Mediengalerie). Eigene Alias-Namen halten die API-Semantik lesbar.
export const galleryFileSchema = orbitAssetSchema;
export const galleryFileResponseSchema = z.object({ file: galleryFileSchema });
export const galleryFileListResponseSchema = z.object({
  files: z.array(galleryFileSchema),
  nextCursor: z.string().min(1).nullable(),
});

export type OrbitAsset = z.infer<typeof orbitAssetSchema>;
export type OrbitAssetResponse = z.infer<typeof orbitAssetResponseSchema>;
export type OrbitAssetListResponse = z.infer<typeof orbitAssetListResponseSchema>;
export type GalleryFolder = z.infer<typeof galleryFolderSchema>;
export type GalleryFolderResponse = z.infer<typeof galleryFolderResponseSchema>;
export type GalleryFolderListResponse = z.infer<typeof galleryFolderListResponseSchema>;
export type CreateGalleryFolderRequest = z.infer<typeof createGalleryFolderRequestSchema>;
export type UpdateGalleryFolderRequest = z.infer<typeof updateGalleryFolderRequestSchema>;
export type UpdateGalleryFileRequest = z.infer<typeof updateGalleryFileRequestSchema>;
export type GalleryFile = z.infer<typeof galleryFileSchema>;
export type GalleryFileResponse = z.infer<typeof galleryFileResponseSchema>;
export type GalleryFileListResponse = z.infer<typeof galleryFileListResponseSchema>;
