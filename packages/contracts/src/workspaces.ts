import { z } from "zod";

const isoDateSchema = z.iso.datetime({ offset: true });

const workspaceIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);

const workspaceNameSchema = z.string().min(1).max(80).refine(
  (value) => value.trim().length > 0 && ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  }),
  { message: "Der Workspace-Name ist ungültig." },
);

/** Nur reine http(s)-Origins, ohne Pfad, Query oder Zugangsdaten. */
const workspaceUrlSchema = z.string().transform((value, context) => {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Protokoll");
    if (!parsed.hostname || parsed.username || parsed.password || parsed.origin === "null") throw new Error("Origin");
    return parsed.origin;
  } catch {
    context.addIssue({ code: "custom", message: "Die Workspace-URL ist ungültig." });
    return z.NEVER;
  }
});

export const workspaceEntrySchema = z.object({
  id: workspaceIdSchema,
  name: workspaceNameSchema,
  customName: z.literal(true).optional(),
  url: workspaceUrlSchema,
  addedAt: isoDateSchema,
  lastUsedAt: isoDateSchema.nullable(),
});

export const workspaceRegistrySnapshotSchema = z.object({
  entries: z.array(workspaceEntrySchema).max(32),
  changedAt: z.record(z.string().max(2048), isoDateSchema),
  deletedAt: z.record(z.string().max(2048), isoDateSchema),
});

export const workspaceRegistryResponseSchema = z.object({
  document: workspaceRegistrySnapshotSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
});

export const saveWorkspaceRegistryRequestSchema = z.object({
  document: workspaceRegistrySnapshotSchema,
  expectedRevision: z.number().int().nonnegative().nullable(),
});

export type WorkspaceRegistryEntry = z.infer<typeof workspaceEntrySchema>;
export type WorkspaceRegistrySnapshot = z.infer<typeof workspaceRegistrySnapshotSchema>;
export type WorkspaceRegistryResponse = z.infer<typeof workspaceRegistryResponseSchema>;
export type SaveWorkspaceRegistryRequest = z.infer<typeof saveWorkspaceRegistryRequestSchema>;
