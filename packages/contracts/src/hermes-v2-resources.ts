import { z } from "zod";
import { hermesV2IdSchema } from "./hermes-v2-sessions.js";

export const hermesV2ResourceScopeSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const hermesV2ResourceErrorSchema = z.strictObject({
  code: z.enum(["INVALID_RESOURCE_REQUEST", "V2_DISABLED", "FORBIDDEN", "RESOURCE_UNAVAILABLE", "SOURCE_IDENTITY_UNKNOWN",
    "STALE_RESOURCE_CONTEXT", "TARGET_UNAVAILABLE", "PROJECT_FORBIDDEN", "NATIVE_CONFLICT", "UPSTREAM_REJECTED", "UNKNOWN_OUTCOME", "UNSUPPORTED", "RATE_LIMITED"]),
  message: z.string().max(500), outcome: z.enum(["not_sent", "rejected", "unknown"]), retryable: z.literal(false),
});
export const hermesV2ResourceTextSchema = z.strictObject({ text: z.string().max(65_536).nullable(),
  status: z.enum(["available", "empty", "missing", "unreadable", "unknown"]), bytes: z.number().int().nonnegative().nullable(), truncated: z.boolean() });
export const hermesV2ResourceActionSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema });
export const hermesV2SessionDeletionPreviewSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema, requestedSessionId: hermesV2IdSchema,
  title: z.string().max(200), deletable: z.boolean(), reason: z.string().max(500).nullable(), effect: z.literal("compression-chain") });
export const hermesV2SessionDeleteSchema = hermesV2ResourceActionSchema.extend({ confirm: z.literal("delete-compression-chain") });
export const hermesV2SessionDeletedSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema, outcome: z.literal("confirmed"),
  requestedSessionId: hermesV2IdSchema, alreadyAbsent: z.boolean(), confirmedAbsentSessionIds: z.array(hermesV2IdSchema).max(100),
  affectedIdsComplete: z.literal(false), effect: z.literal("compression-chain") });
export type HermesV2ResourceText = z.infer<typeof hermesV2ResourceTextSchema>;
export type HermesV2ResourceError = z.infer<typeof hermesV2ResourceErrorSchema>;
export type HermesV2ResourceAction = z.infer<typeof hermesV2ResourceActionSchema>;
export type HermesV2SessionDeletionPreview = z.infer<typeof hermesV2SessionDeletionPreviewSchema>;
export type HermesV2SessionDelete = z.infer<typeof hermesV2SessionDeleteSchema>;
export type HermesV2SessionDeleted = z.infer<typeof hermesV2SessionDeletedSchema>;
