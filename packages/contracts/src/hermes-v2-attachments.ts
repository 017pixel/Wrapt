import { z } from "zod";

export const hermesV2AttachmentIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const hermesV2AttachmentSchema = z.strictObject({
  id: hermesV2AttachmentIdSchema, name: z.string().min(1).max(200), bytes: z.number().int().min(1).max(4_194_304),
  mime: z.string().min(1).max(100), kind: z.literal("file-reference"), expiresAt: z.number().int().nonnegative(),
});
export const hermesV2UploadStatusSchema = z.strictObject({
  uploadId: z.string().uuid(), state: z.enum(["receiving", "ready", "not_sent", "unknown"]), attachment: hermesV2AttachmentSchema.nullable(),
});
export const hermesV2AttachmentErrorSchema = z.strictObject({
  code: z.string().min(1).max(100), message: z.string().max(500), outcome: z.enum(["not_sent", "unknown"]), uploadId: z.string().uuid().optional(),
});
export type HermesV2Attachment = z.infer<typeof hermesV2AttachmentSchema>;
export type HermesV2UploadStatus = z.infer<typeof hermesV2UploadStatusSchema>;
