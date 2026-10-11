import { z } from "zod";

const isoDateSchema = z.iso.datetime({ offset: true });

/**
 * Verträge für beaufsichtigte Preview-Projektlaufzeiten. Dienste werden erkannt
 * oder explizit konfiguriert und gemeinsam geführt, getrennt von interaktiven
 * Terminals. Unbestätigte Befehle starten nicht ohne explizite Freigabe.
 */

// Preview Hub: beaufsichtigte Projektlaufzeiten laufen getrennt von interaktiven
// Terminals. Erkannte oder explizit konfigurierte Dienste werden gemeinsam geführt.
export const previewDevServerStateSchema = z.enum(["stopped", "starting", "running", "stopping", "failed", "unknown"]);
export const previewExternalOpenModeSchema = z.enum(["window", "tab"]);
export const previewRuntimeServiceRoleSchema = z.enum(["frontend", "backend", "api", "database", "socket", "worker", "other"]);
export const previewRuntimeProfileSourceSchema = z.enum(["configured", "detected"]);
export const previewRuntimePortModeSchema = z.enum(["argument", "environment", "none"]);
export const previewRuntimeLogLevelSchema = z.enum(["error", "warning", "success", "info"]);
export const previewRuntimeServiceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(80),
  role: previewRuntimeServiceRoleSchema,
  command: z.string().min(1).max(1_000),
  workingDirectory: z.string().min(1).max(4_096),
  port: z.number().int().min(1).max(65_535).nullable(),
  portMode: previewRuntimePortModeSchema,
  source: previewRuntimeProfileSourceSchema,
  frameworkHints: z.array(z.string().min(1).max(60)).max(12).default([]),
});
export const previewRuntimeProfileSchema = z.object({
  projectId: z.string().min(1).max(160),
  source: previewRuntimeProfileSourceSchema,
  mainServiceId: z.string().min(1).max(120).nullable(),
  services: z.array(previewRuntimeServiceSchema).max(10),
  allowedPorts: z.array(z.number().int().min(1).max(65_535)).min(1).max(128),
  warnings: z.array(z.string().min(1).max(400)).max(24).default([]),
  detectedAt: isoDateSchema,
});
export const previewRuntimeServiceStatusSchema = previewRuntimeServiceSchema.extend({
  state: previewDevServerStateSchema,
  pid: z.number().int().positive().nullable(),
  startedAt: isoDateSchema.nullable(),
  exitCode: z.number().int().nullable(),
  message: z.string().max(600).nullable(),
});
export const previewDevServerStatusSchema = z.object({
  projectId: z.string().min(1).max(160),
  state: previewDevServerStateSchema,
  command: z.string().min(1).max(120).default("npm run dev"),
  mainPort: z.number().int().min(1).max(65_535).nullable(),
  mainServiceId: z.string().min(1).max(120).nullable().default(null),
  profileSource: previewRuntimeProfileSourceSchema.default("detected"),
  services: z.array(previewRuntimeServiceStatusSchema).max(10).default([]),
  allowedPorts: z.array(z.number().int().min(1).max(65_535)).max(128).default([]),
  warnings: z.array(z.string().min(1).max(400)).max(24).default([]),
  publicUrl: z.url().nullable().default(null),
  pid: z.number().int().positive().nullable(),
  startedAt: isoDateSchema.nullable(),
  updatedAt: isoDateSchema,
  exitCode: z.number().int().nullable(),
  message: z.string().max(600).nullable(),
});
export const previewDevServersResponseSchema = z.object({
  runtimes: z.array(previewDevServerStatusSchema).max(128),
});
export const previewRuntimeLogLineSchema = z.object({
  serviceId: z.string().min(1).max(120),
  level: previewRuntimeLogLevelSchema,
  text: z.string().max(4_000),
});
export const previewRuntimeServiceLogsSchema = z.object({
  serviceId: z.string().min(1).max(120),
  name: z.string().min(1).max(80),
  role: previewRuntimeServiceRoleSchema,
  port: z.number().int().min(1).max(65_535).nullable(),
  state: previewDevServerStateSchema,
  output: z.string().max(262_144),
  lines: z.array(previewRuntimeLogLineSchema).max(4_000),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export const previewDevServerLogsSchema = z.object({
  projectId: z.string().min(1).max(160),
  output: z.string().max(262_144),
  truncated: z.boolean(),
  services: z.array(previewRuntimeServiceLogsSchema).max(10).default([]),
  errorCount: z.number().int().nonnegative().default(0),
  warningCount: z.number().int().nonnegative().default(0),
  capturedAt: isoDateSchema,
});
export const previewDevServerMainPortRequestSchema = z.object({
  mainPort: z.number().int().min(1).max(65_535).nullable(),
});
export const previewDevServerConfirmRequestSchema = z.object({
  commandHash: z.string().trim().min(4).max(64),
});
export const previewDevServerConfirmResponseSchema = z.object({
  confirmed: z.literal(true),
  projectId: z.string().min(1).max(160),
  projectPath: z.string().min(1),
  commandHash: z.string().min(4).max(64),
  commandPreview: z.string().min(1),
  confirmedAt: isoDateSchema,
});

export type PreviewDevServerState = z.infer<typeof previewDevServerStateSchema>;
export type PreviewExternalOpenMode = z.infer<typeof previewExternalOpenModeSchema>;
export type PreviewRuntimeServiceRole = z.infer<typeof previewRuntimeServiceRoleSchema>;
export type PreviewRuntimeProfileSource = z.infer<typeof previewRuntimeProfileSourceSchema>;
export type PreviewRuntimePortMode = z.infer<typeof previewRuntimePortModeSchema>;
export type PreviewRuntimeLogLevel = z.infer<typeof previewRuntimeLogLevelSchema>;
export type PreviewRuntimeService = z.infer<typeof previewRuntimeServiceSchema>;
export type PreviewRuntimeProfile = z.infer<typeof previewRuntimeProfileSchema>;
export type PreviewRuntimeServiceStatus = z.infer<typeof previewRuntimeServiceStatusSchema>;
export type PreviewRuntimeLogLine = z.infer<typeof previewRuntimeLogLineSchema>;
export type PreviewRuntimeServiceLogs = z.infer<typeof previewRuntimeServiceLogsSchema>;
export type PreviewDevServerStatus = z.infer<typeof previewDevServerStatusSchema>;
export type PreviewDevServersResponse = z.infer<typeof previewDevServersResponseSchema>;
export type PreviewDevServerLogs = z.infer<typeof previewDevServerLogsSchema>;
export type PreviewDevServerMainPortRequest = z.infer<typeof previewDevServerMainPortRequestSchema>;
export type PreviewDevServerConfirmResponse = z.infer<typeof previewDevServerConfirmResponseSchema>;
