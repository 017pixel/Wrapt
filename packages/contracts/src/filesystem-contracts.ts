import { z } from "zod";
import { isoDateSchema } from "./host-system.js";

export const filesystemEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  kind: z.enum(["directory", "file", "symlink", "other"]),
  sizeBytes: z.number().int().nonnegative().nullable(),
  modifiedAt: isoDateSchema.nullable(),
  readable: z.boolean(),
});

export const filesystemTreeResponseSchema = z.object({
  root: z.string().startsWith("/"),
  path: z.string().startsWith("/"),
  entries: z.array(filesystemEntrySchema),
  nextCursor: z.string().min(1).nullable(),
});

// --- Dateimanager -----------------------------------------------------------
export const fileManagerViewModeSchema = z.enum(["list", "grid"]);

export const fileManagerSortKeySchema = z.enum(["name", "size", "modified"]);

export const fileManagerSortDirectionSchema = z.enum(["asc", "desc"]);

export const fileManagerStateSchema = z.object({
  currentPath: z.string().startsWith("/").max(4_096),
  history: z.array(z.string().startsWith("/").max(4_096)).max(30),
  favorites: z.array(z.string().startsWith("/").max(4_096)).max(50),
  viewMode: fileManagerViewModeSchema,
  sortKey: fileManagerSortKeySchema,
  sortDirection: fileManagerSortDirectionSchema,
});

export const fileManagerStateResponseSchema = z.object({
  document: fileManagerStateSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
});

export const saveFileManagerStateRequestSchema = z.object({
  document: fileManagerStateSchema,
  expectedRevision: z.number().int().nonnegative().nullable(),
});

export const fileManagerTextPreviewResponseSchema = z.object({
  path: z.string().startsWith("/"),
  name: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: isoDateSchema,
  mimeType: z.string().min(1),
  text: z.string().max(400_000),
  truncated: z.boolean(),
  lineCount: z.number().int().nonnegative(),
});

export const fileManagerRenameRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  name: z.string().trim().min(1).max(255).refine((value) => !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..", "Ungültiger Dateiname."),
});

export const fileManagerMoveRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  targetDirectory: z.string().trim().min(1).max(4_096),
});

export const fileManagerDeleteRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  confirmed: z.boolean().refine((value) => value, "Löschen muss bestätigt werden."),
});

export const fileManagerMkdirRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  name: z.string().trim().min(1).max(255).refine((value) => !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..", "Ungültiger Ordnername."),
});

export const fileManagerOperationResponseSchema = z.object({
  path: z.string().startsWith("/"),
  ok: z.literal(true),
});

export const fileManagerSearchResponseSchema = z.object({
  query: z.string().min(1).max(200),
  root: z.string().startsWith("/"),
  entries: z.array(filesystemEntrySchema).max(250),
  truncated: z.boolean(),
});

export type FilesystemEntry = z.infer<typeof filesystemEntrySchema>;

export type FilesystemTreeResponse = z.infer<typeof filesystemTreeResponseSchema>;

export type FileManagerState = z.infer<typeof fileManagerStateSchema>;

export type FileManagerStateResponse = z.infer<typeof fileManagerStateResponseSchema>;

export type FileManagerTextPreviewResponse = z.infer<typeof fileManagerTextPreviewResponseSchema>;

export type FileManagerSearchResponse = z.infer<typeof fileManagerSearchResponseSchema>;
