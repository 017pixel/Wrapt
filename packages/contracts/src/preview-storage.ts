import { z } from "zod";
import { isoDateSchema } from "./host-system.js";

// ── localStorage-Snapshots ─────────────────────────────────────────────────────
export const PREVIEW_STORAGE_LIMITS = {
  maxKeys: 1_000,
  maxBytes: 262_144,
  maxHistory: 3,
} as const;

export const previewLocalStorageEntrySchema = z.object({
  key: z.string().max(1_024),
  value: z.string().max(PREVIEW_STORAGE_LIMITS.maxBytes),
});

export const previewLocalStorageSnapshotSchema = z.object({
  storageProfileId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
  keyCount: z.number().int().nonnegative().max(PREVIEW_STORAGE_LIMITS.maxKeys),
  byteCount: z.number().int().nonnegative().max(PREVIEW_STORAGE_LIMITS.maxBytes),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  bridgeVersion: z.string().min(1).max(40),
  // `unavailable`, wenn der Snapshot-Schlüssel fehlt oder wechselte.
  status: z.enum(["ready", "unavailable"]).default("ready"),
});

export const previewLocalStorageStateSchema = z.object({
  storageProfileId: z.string().uuid(),
  enabled: z.boolean().default(false),
  current: previewLocalStorageSnapshotSchema.nullable().default(null),
  history: z.array(previewLocalStorageSnapshotSchema).max(PREVIEW_STORAGE_LIMITS.maxHistory).default([]),
});

export const previewLocalStorageSnapshotRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative().nullable(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  bridgeVersion: z.string().min(1).max(40),
  entries: z.array(previewLocalStorageEntrySchema).max(PREVIEW_STORAGE_LIMITS.maxKeys),
});

export const previewLocalStorageRestoreRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
});

export const previewLocalStorageRestoreResponseSchema = z.object({
  snapshot: previewLocalStorageSnapshotSchema,
  entries: z.array(previewLocalStorageEntrySchema).max(PREVIEW_STORAGE_LIMITS.maxKeys),
});

export const previewLocalStorageConflictSchema = z.object({
  serverRevision: z.number().int().nonnegative(),
  serverHash: z.string().regex(/^[0-9a-f]{64}$/),
  serverKeyCount: z.number().int().nonnegative(),
  serverByteCount: z.number().int().nonnegative(),
});

// ── Reparatur ──────────────────────────────────────────────────────────────────
// Bewusst nur feste, validierte Aktionen. Shell, Dateisystem und Projektcode bleiben tabu.
export const previewRepairActionSchema = z.enum([
  "probe-services",
  "rebuild-suggestions",
  "renew-own-session",
  "release-own-session",
  "reset-slot-storage",
  "clear-quarantine",
]);

export const previewRepairRequestSchema = z.object({
  action: previewRepairActionSchema,
  projectId: z.string().min(1).max(160).nullable().default(null),
  sessionId: z.string().uuid().nullable().default(null),
  slotId: z.number().int().min(1).max(128).nullable().default(null),
  // Reset und Quarantäneaufhebung verlangen eine sichtbare Bestätigung im UI.
  confirmed: z.boolean().default(false),
});

export const previewRepairJobSchema = z.object({
  id: z.string().uuid(),
  action: previewRepairActionSchema,
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  startedAt: isoDateSchema,
  finishedAt: isoDateSchema.nullable().default(null),
  message: z.string().max(600),
  details: z.record(z.string().max(80), z.unknown()).default({}),
});

export type PreviewLocalStorageEntry = z.infer<typeof previewLocalStorageEntrySchema>;

export type PreviewLocalStorageSnapshot = z.infer<typeof previewLocalStorageSnapshotSchema>;

export type PreviewLocalStorageState = z.infer<typeof previewLocalStorageStateSchema>;

export type PreviewLocalStorageSnapshotRequest = z.infer<typeof previewLocalStorageSnapshotRequestSchema>;

export type PreviewLocalStorageRestoreRequest = z.infer<typeof previewLocalStorageRestoreRequestSchema>;

export type PreviewLocalStorageRestoreResponse = z.infer<typeof previewLocalStorageRestoreResponseSchema>;

export type PreviewLocalStorageConflict = z.infer<typeof previewLocalStorageConflictSchema>;

export type PreviewRepairAction = z.infer<typeof previewRepairActionSchema>;

export type PreviewRepairRequest = z.infer<typeof previewRepairRequestSchema>;

export type PreviewRepairJob = z.infer<typeof previewRepairJobSchema>;
