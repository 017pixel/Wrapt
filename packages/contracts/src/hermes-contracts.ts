import { z } from "zod";
import { isoDateSchema } from "./host-system.js";

export const hermesServiceStateSchema = z.enum(["active", "inactive", "failed", "activating", "unknown"]);

export const hermesUpdateResultSchema = z.enum(["success", "failed", "deferred", "none"]);

export const hermesSessionSourceSchema = z.enum(["web", "cli", "telegram", "cron", "acp", "other"]);

export const hermesSessionStatusSchema = z.enum(["idle", "running", "failed", "unknown"]);

export const hermesStatusSchema = z.object({
  enabled: z.boolean(),
  installed: z.boolean(),
  reachable: z.boolean(),
  version: z.string().nullable(),
  commit: z.string().max(40).nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  dashboard: z.object({
    state: hermesServiceStateSchema,
    reachable: z.boolean(),
    url: z.string().nullable(),
  }),
  gateway: z.object({
    state: hermesServiceStateSchema,
    telegramConnected: z.boolean().nullable(),
    lastError: z.string().max(500).nullable(),
  }),
  chat: z.object({
    transport: z.enum(["acp", "unavailable"]),
    ready: z.boolean(),
    activeSessions: z.number().int().nonnegative(),
  }),
  update: z.object({
    available: z.boolean(),
    pending: z.boolean(),
    running: z.boolean(),
    currentVersion: z.string().nullable(),
    latestVersion: z.string().nullable(),
    lastCheckedAt: isoDateSchema.nullable(),
    lastUpdatedAt: isoDateSchema.nullable(),
    lastResult: hermesUpdateResultSchema,
  }),
  checkedAt: isoDateSchema,
});

export const hermesSessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  source: hermesSessionSourceSchema,
  model: z.string().nullable(),
  provider: z.string().nullable(),
  cwd: z.string().nullable(),
  projectId: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema.nullable(),
  updatedAt: isoDateSchema.nullable(),
  status: hermesSessionStatusSchema,
});

export const hermesSessionsResponseSchema = z.object({
  sessions: z.array(hermesSessionSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative().optional(),
});

export const hermesTaskSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().max(200),
  source: hermesSessionSourceSchema,
  model: z.string().nullable(),
  startedAt: isoDateSchema,
  runtimeSeconds: z.number().int().nonnegative(),
  cancellable: z.boolean(),
});

export const hermesTasksResponseSchema = z.object({ tasks: z.array(hermesTaskSchema) });

export const hermesResultSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  source: hermesSessionSourceSchema,
  status: z.enum(["success", "failed"]),
  title: z.string().max(200),
  preview: z.string().max(400),
  finishedAt: isoDateSchema,
  cronJobId: z.string().nullable(),
});

export const hermesResultsResponseSchema = z.object({
  results: z.array(hermesResultSchema),
  nextCursor: z.string().nullable(),
});

export const hermesCronJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(200),
  schedule: z.string().max(120),
  enabled: z.boolean(),
  nextRunAt: isoDateSchema.nullable(),
  lastRunAt: isoDateSchema.nullable(),
  lastStatus: z.enum(["success", "failed", "running", "unknown"]),
  adminPath: z.string().startsWith("/"),
});

export const hermesCronResponseSchema = z.object({ jobs: z.array(hermesCronJobSchema) });

export const hermesModelSchema = z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(200), provider: z.string().max(120).nullable(), active: z.boolean() });

export const hermesModelsResponseSchema = z.object({ models: z.array(hermesModelSchema), current: hermesModelSchema.nullable() });

export const hermesToolKindSchema = z.enum(["terminal", "edit", "read", "search", "browser", "other"]);

export const hermesToolStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export const hermesToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(160),
  kind: hermesToolKindSchema,
  status: hermesToolStatusSchema,
  title: z.string().max(240),
  arguments: z.record(z.string(), z.unknown()).nullable(),
  result: z.string().max(8_192).nullable(),
  command: z.string().max(8_192).nullable(),
  cwd: z.string().max(2_048).nullable(),
  exitCode: z.number().int().nullable(),
  startedAt: isoDateSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  truncated: z.boolean(),
});

export const hermesMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(200_000),
  toolCalls: z.array(hermesToolCallSchema).default([]),
  createdAt: isoDateSchema,
  truncated: z.boolean().default(false),
});

export const hermesApprovalSchema = z.object({
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  toolCallId: z.string().min(1).nullable(),
  title: z.string().max(240),
  description: z.string().max(2_000),
  command: z.string().max(8_192).nullable(),
  risk: z.enum(["low", "medium", "high"]),
  options: z.array(z.enum(["allow_once", "allow_session", "deny"])).min(1),
  expiresAt: isoDateSchema,
});

export const hermesSlashCommandSchema = z.object({ name: z.string().min(1).max(80), description: z.string().max(240), inputHint: z.string().max(160).nullable() });

export const hermesUsageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative(), contextSize: z.number().int().nonnegative().nullable() });

export const hermesErrorCodeSchema = z.enum([
  "HERMES_DISABLED", "HERMES_NOT_INSTALLED", "DASHBOARD_UNREACHABLE", "ACP_UNAVAILABLE", "ACP_CRASHED",
  "SESSION_NOT_FOUND", "SESSION_BUSY", "PROJECT_NOT_FOUND", "PROJECT_FORBIDDEN", "APPROVAL_EXPIRED",
  "RATE_LIMITED", "UPDATE_RUNNING", "INVALID_MESSAGE", "INTERNAL_ERROR",
]);

export const HERMES_CHAT_PROTOCOL_VERSION = 1 as const;

export const hermesClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ v: z.literal(1), type: z.literal("session.create"), projectId: z.string().nullable(), title: z.string().max(200).optional() }),
  z.object({ v: z.literal(1), type: z.literal("session.attach"), sessionId: z.string().min(1) }),
  z.object({ v: z.literal(1), type: z.literal("session.detach") }),
  z.object({ v: z.literal(1), type: z.literal("message.send"), sessionId: z.string().min(1), clientMessageId: z.uuid(), content: z.string().min(1).max(200_000) }),
  z.object({ v: z.literal(1), type: z.literal("task.cancel"), sessionId: z.string().min(1) }),
  z.object({ v: z.literal(1), type: z.literal("approval.respond"), requestId: z.string().min(1), option: z.enum(["allow_once", "allow_session", "deny"]) }),
  z.object({ v: z.literal(1), type: z.literal("model.set"), sessionId: z.string().min(1), model: z.string().min(1).max(200) }),
  z.object({ v: z.literal(1), type: z.literal("ping") }),
]);

export const hermesServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ v: z.literal(1), type: z.literal("session.ready"), session: hermesSessionSchema, replayComplete: z.boolean() }),
  z.object({ v: z.literal(1), type: z.literal("message.appended"), sessionId: z.string(), message: hermesMessageSchema }),
  z.object({ v: z.literal(1), type: z.literal("message.delta"), sessionId: z.string(), messageId: z.string(), delta: z.string() }),
  z.object({ v: z.literal(1), type: z.literal("message.complete"), sessionId: z.string(), message: hermesMessageSchema }),
  z.object({ v: z.literal(1), type: z.literal("thought.delta"), sessionId: z.string(), delta: z.string() }),
  z.object({ v: z.literal(1), type: z.literal("tool.update"), sessionId: z.string(), toolCall: hermesToolCallSchema }),
  z.object({ v: z.literal(1), type: z.literal("approval.requested"), request: hermesApprovalSchema }),
  z.object({ v: z.literal(1), type: z.literal("approval.resolved"), requestId: z.string(), option: z.string(), reason: z.enum(["answered", "expired", "cancelled"]) }),
  z.object({ v: z.literal(1), type: z.literal("commands.available"), sessionId: z.string(), commands: z.array(hermesSlashCommandSchema) }),
  z.object({ v: z.literal(1), type: z.literal("task.state"), sessionId: z.string(), state: z.enum(["idle", "running", "cancelling"]) }),
  z.object({ v: z.literal(1), type: z.literal("usage"), sessionId: z.string(), usage: hermesUsageSchema }),
  z.object({ v: z.literal(1), type: z.literal("error"), code: hermesErrorCodeSchema, message: z.string().max(500), sessionId: z.string().nullable() }),
  z.object({ v: z.literal(1), type: z.literal("pong") }),
]);

export const hermesServiceActionRequestSchema = z.object({ target: z.enum(["dashboard", "gateway"]), action: z.enum(["start", "stop", "restart"]) });

export const hermesDiagnosticSchema = z.object({ id: z.string().min(1), label: z.string().min(1), status: z.enum(["ok", "warn", "fail", "skipped"]), detail: z.string().max(500), hint: z.string().max(500) });

export const hermesDiagnosticsResponseSchema = z.object({ checkedAt: isoDateSchema, items: z.array(hermesDiagnosticSchema) });

export const hermesUpdateStateSchema = z.object({
  phase: z.enum(["idle", "checking", "pending", "running", "succeeded", "failed"]),
  pending: z.boolean(), lastCheckedAt: isoDateSchema.nullable(), lastStartedAt: isoDateSchema.nullable(), lastFinishedAt: isoDateSchema.nullable(),
  lastResult: hermesUpdateResultSchema, previousVersion: z.string().nullable(), previousCommit: z.string().max(40).nullable(),
  newVersion: z.string().nullable(), newCommit: z.string().max(40).nullable(), deferredSince: isoDateSchema.nullable(),
  lastFullBackupAt: isoDateSchema.nullable(), logTail: z.array(z.string().max(500)).max(40),
});

export type HermesServiceState = z.infer<typeof hermesServiceStateSchema>;

export type HermesUpdateResult = z.infer<typeof hermesUpdateResultSchema>;

export type HermesStatus = z.infer<typeof hermesStatusSchema>;

export type HermesSessionSource = z.infer<typeof hermesSessionSourceSchema>;

export type HermesSession = z.infer<typeof hermesSessionSchema>;

export type HermesSessionsResponse = z.infer<typeof hermesSessionsResponseSchema>;

export type HermesTask = z.infer<typeof hermesTaskSchema>;

export type HermesTasksResponse = z.infer<typeof hermesTasksResponseSchema>;

export type HermesResult = z.infer<typeof hermesResultSchema>;

export type HermesResultsResponse = z.infer<typeof hermesResultsResponseSchema>;

export type HermesCronJob = z.infer<typeof hermesCronJobSchema>;

export type HermesCronResponse = z.infer<typeof hermesCronResponseSchema>;

export type HermesModel = z.infer<typeof hermesModelSchema>;

export type HermesModelsResponse = z.infer<typeof hermesModelsResponseSchema>;

export type HermesToolCall = z.infer<typeof hermesToolCallSchema>;

export type HermesMessage = z.infer<typeof hermesMessageSchema>;

export type HermesApproval = z.infer<typeof hermesApprovalSchema>;

export type HermesSlashCommand = z.infer<typeof hermesSlashCommandSchema>;

export type HermesUsage = z.infer<typeof hermesUsageSchema>;

export type HermesErrorCode = z.infer<typeof hermesErrorCodeSchema>;

export type HermesClientMessage = z.infer<typeof hermesClientMessageSchema>;

export type HermesServerMessage = z.infer<typeof hermesServerMessageSchema>;

export type HermesServiceActionRequest = z.infer<typeof hermesServiceActionRequestSchema>;

export type HermesDiagnostic = z.infer<typeof hermesDiagnosticSchema>;

export type HermesDiagnosticsResponse = z.infer<typeof hermesDiagnosticsResponseSchema>;

export type HermesUpdateState = z.infer<typeof hermesUpdateStateSchema>;
