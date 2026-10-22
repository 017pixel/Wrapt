import { z } from "zod";
import { isoDateSchema } from "./host-system.js";
import { previewLimitationSchema } from "./preview-sessions.js";

// ── Service-Graph ──────────────────────────────────────────────────────────────
export const previewServiceRoleSchema = z.enum(["primary", "api", "socket", "asset", "other"]);

export const previewServiceProtocolSchema = z.enum(["http", "https", "ws", "wss"]);

export const previewProbeStatusSchema = z.enum(["reachable", "unreachable", "unknown"]);

export const previewServiceCandidateSchema = z.object({
  serviceId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(160).nullable(),
  port: z.number().int().min(1).max(65_535),
  process: z.string().max(160).nullable(),
  pid: z.number().int().positive().nullable(),
  // Kanonischer Arbeitsordner des Prozesses; nur zur Projektzuordnung.
  cwd: z.string().max(4_096).nullable(),
  protocol: previewServiceProtocolSchema,
  probeStatus: previewProbeStatusSchema,
  // Rein statisch gelesene Hinweise; es wird niemals fremde Konfiguration ausgeführt.
  scripts: z.array(z.string().max(120)).max(24).default([]),
  frameworkHints: z.array(z.string().max(60)).max(12).default([]),
  supportsWebSocket: z.boolean().default(false),
  suggestedRole: previewServiceRoleSchema.default("other"),
  detectedAt: isoDateSchema,
});

export const previewServiceCandidatesResponseSchema = z.object({
  projectId: z.string().min(1).max(160).nullable(),
  candidates: z.array(previewServiceCandidateSchema).max(64),
  scannedAt: isoDateSchema,
});

export const previewServiceEdgeSchema = z.object({
  serviceId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(160).nullable(),
  port: z.number().int().min(1).max(65_535),
  protocol: previewServiceProtocolSchema,
  role: previewServiceRoleSchema,
  label: z.string().trim().min(1).max(80),
  probeStatus: previewProbeStatusSchema.default("unknown"),
  source: z.enum(["manual", "detected"]).default("detected"),
  confirmedAt: isoDateSchema,
});

export const previewServiceGraphSchema = z.object({
  projectId: z.string().min(1).max(160),
  primaryServiceId: z.string().min(1).max(120),
  edges: z.array(previewServiceEdgeSchema).max(11),
  updatedAt: isoDateSchema.nullable().default(null),
});

export const previewServiceGraphRequestSchema = previewServiceGraphSchema.pick({ edges: true });

// Kapazität wird vor dem Speichern angezeigt; ein zu großer Graph wird nie teilweise aktiviert.
export const previewCapacityPreviewSchema = z.object({
  requiredSlots: z.number().int().nonnegative(),
  reusableSlots: z.number().int().nonnegative(),
  freeSlots: z.number().int().nonnegative(),
  totalSlots: z.number().int().nonnegative(),
  fits: z.boolean(),
  limitations: z.array(previewLimitationSchema).max(16).default([]),
});

export const previewServiceGraphResponseSchema = z.object({
  graph: previewServiceGraphSchema,
  capacity: previewCapacityPreviewSchema,
});

export type PreviewServiceRole = z.infer<typeof previewServiceRoleSchema>;

export type PreviewServiceProtocol = z.infer<typeof previewServiceProtocolSchema>;

export type PreviewProbeStatus = z.infer<typeof previewProbeStatusSchema>;

export type PreviewServiceCandidate = z.infer<typeof previewServiceCandidateSchema>;

export type PreviewServiceCandidatesResponse = z.infer<typeof previewServiceCandidatesResponseSchema>;

export type PreviewServiceEdge = z.infer<typeof previewServiceEdgeSchema>;

export type PreviewServiceGraph = z.infer<typeof previewServiceGraphSchema>;

export type PreviewServiceGraphRequest = z.infer<typeof previewServiceGraphRequestSchema>;

export type PreviewServiceGraphResponse = z.infer<typeof previewServiceGraphResponseSchema>;

export type PreviewCapacityPreview = z.infer<typeof previewCapacityPreviewSchema>;
