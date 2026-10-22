import { z } from "zod";
import { isoDateSchema } from "./host-system.js";

// ── Diagnose ───────────────────────────────────────────────────────────────────
export const previewDiagnosticSourceSchema = z.enum(["client", "gateway", "socket", "system", "inferred"]);

export const previewDiagnosticCategorySchema = z.enum([
  "console",
  "error",
  "network",
  "routing",
  "navigation",
  "storage",
  "lifecycle",
  "performance",
]);

export const previewDiagnosticSeveritySchema = z.enum(["debug", "info", "warn", "error"]);

export const previewDiagnosticCompletenessSchema = z.enum(["complete", "partial", "inferred"]);

export const PREVIEW_DIAGNOSTIC_LIMITS = {
  maxEventsPerBatch: 100,
  maxBatchBytes: 262_144,
  maxEventBytes: 65_536,
  clientRingBuffer: 2_000,
  maxRetentionDays: 7,
} as const;

export const previewDiagnosticEventSchema = z.object({
  id: z.string().uuid(),
  at: isoDateSchema,
  source: previewDiagnosticSourceSchema,
  category: previewDiagnosticCategorySchema,
  severity: previewDiagnosticSeveritySchema,
  completeness: previewDiagnosticCompletenessSchema.default("complete"),
  previewNodeId: z.string().max(120).nullable().default(null),
  sessionId: z.string().uuid().nullable().default(null),
  slotId: z.number().int().min(1).max(128).nullable().default(null),
  routingRevision: z.number().int().nonnegative().nullable().default(null),
  bridgeSessionId: z.string().max(120).nullable().default(null),
  epoch: z.number().int().nonnegative().default(0),
  sequence: z.number().int().nonnegative().default(0),
  route: z.string().max(2_048).nullable().default(null),
  message: z.string().max(8_192),
  // Bereits redigierte, größenbegrenzte Zusatzdaten. Bodies gehören hier nie hinein.
  metadata: z.record(z.string().max(80), z.unknown()).default({}),
});

export const previewDiagnosticBatchSchema = z.object({
  previewNodeId: z.string().max(120).nullable().default(null),
  sessionId: z.string().uuid().nullable().default(null),
  bridgeSessionId: z.string().max(120).nullable().default(null),
  droppedSinceLastBatch: z.number().int().nonnegative().max(1_000_000).default(0),
  events: z.array(previewDiagnosticEventSchema).min(1).max(PREVIEW_DIAGNOSTIC_LIMITS.maxEventsPerBatch),
});

export const previewDiagnosticsResponseSchema = z.object({
  events: z.array(previewDiagnosticEventSchema).max(500),
  dropped: z.number().int().nonnegative().default(0),
  logFile: z.string().max(255).nullable().default(null),
  retentionDays: z.number().int().min(1).max(7).default(7),
  truncated: z.boolean().default(false),
});

// Zeitlich begrenzte Rohdiagnose. Cookies und Authorization bleiben auch dann ausgeschlossen.
export const previewCaptureSessionRequestSchema = z.object({
  previewNodeId: z.string().min(1).max(120),
  durationMinutes: z.number().int().min(1).max(15).default(15),
});

export const previewCaptureSessionSchema = z.object({
  id: z.string().uuid(),
  previewNodeId: z.string().min(1).max(120),
  startedAt: isoDateSchema,
  expiresAt: isoDateSchema,
  active: z.boolean(),
});

export type PreviewDiagnosticSource = z.infer<typeof previewDiagnosticSourceSchema>;

export type PreviewDiagnosticCategory = z.infer<typeof previewDiagnosticCategorySchema>;

export type PreviewDiagnosticSeverity = z.infer<typeof previewDiagnosticSeveritySchema>;

export type PreviewDiagnosticCompleteness = z.infer<typeof previewDiagnosticCompletenessSchema>;

export type PreviewDiagnosticEvent = z.infer<typeof previewDiagnosticEventSchema>;

export type PreviewDiagnosticBatch = z.infer<typeof previewDiagnosticBatchSchema>;

export type PreviewDiagnosticsResponse = z.infer<typeof previewDiagnosticsResponseSchema>;

export type PreviewCaptureSession = z.infer<typeof previewCaptureSessionSchema>;

export type PreviewCaptureSessionRequest = z.infer<typeof previewCaptureSessionRequestSchema>;
