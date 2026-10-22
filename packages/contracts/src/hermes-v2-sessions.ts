import { z } from "zod";
import { hermesV2AttachmentSchema } from "./hermes-v2-attachments.js";

export const hermesV2IdSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/);
export const HERMES_V2_TEXT_MAX_LENGTH = 200_000;
export const hermesV2TextSchema = z.string().max(HERMES_V2_TEXT_MAX_LENGTH);
export const hermesV2LogicalIdSchema = z.string().regex(/^[0-9a-f]{32}$/);
const nullableText = hermesV2TextSchema.nullable();
const time = z.number().finite().nonnegative().nullable();
export const hermesV2SelectionSchema = z.strictObject({
  provider: z.string().min(1).max(100).regex(/^[A-Za-z0-9_./:@+~-]+$/),
  model: z.string().min(1).max(200).regex(/^[A-Za-z0-9_./:@+~-]+$/),
});
export const hermesV2SessionSchema = z.strictObject({
  id: hermesV2IdSchema,
  title: z.string().max(200),
  preview: z.string().max(1_000),
  source: z.string().max(100),
  model: z.string().max(200).nullable(),
  provider: z.string().max(100).nullable(),
  cwd: z.string().max(4_096).nullable(),
  projectId: hermesV2IdSchema.nullable(),
  messageCount: z.number().int().nonnegative(),
  updatedAt: time,
  running: z.boolean().nullable(),
  startedAt: time,
  draft: z.boolean(),
});
export const hermesV2MessageSchema = z.strictObject({
  id: z.string().min(1).max(300),
  rowId: z.number().int().positive().nullable(),
  logicalId: hermesV2LogicalIdSchema.nullable().optional(),
  readEvidence: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  attachments: z.array(hermesV2AttachmentSchema).max(10).optional(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  text: hermesV2TextSchema,
  reasoning: nullableText,
  timestamp: time,
  toolId: z.string().max(200).nullable(),
  toolName: z.string().max(200).nullable(),
  toolStatus: z.enum(["running", "complete", "unknown"]).nullable(),
  input: z.string().max(65_536).nullable(),
  displayKind: z.string().max(100).nullable(),
});
export const hermesV2InflightSchema = z.strictObject({
  user: hermesV2TextSchema,
  assistant: hermesV2TextSchema,
  streaming: z.boolean(),
  displayKind: z.string().max(100).nullable(),
  displayText: nullableText,
  corrections: z.array(hermesV2TextSchema).max(100),
  error: z.string().max(500).nullable(),
  recoverable: z.boolean(),
});
export const hermesV2UsageSchema = z.strictObject({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  reasoning: z.number().nonnegative(),
  contextUsed: z.number().nonnegative().nullable(),
  contextMax: z.number().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
});
export type HermesV2Selection = z.infer<typeof hermesV2SelectionSchema>;
export type HermesV2Session = z.infer<typeof hermesV2SessionSchema>;
export type HermesV2Message = z.infer<typeof hermesV2MessageSchema>;
export type HermesV2Inflight = z.infer<typeof hermesV2InflightSchema>;
export type HermesV2Usage = z.infer<typeof hermesV2UsageSchema>;
