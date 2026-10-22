import { z } from "zod";
import { resetCreditSchema } from "./reset-credits.js";
import { isoDateSchema } from "./host-system.js";

export const usageWindowSchema = z.object({
  id: z.enum(["primary", "secondary", "tertiary"]),
  label: z.string().min(1),
  usedPercent: z.number().min(0).max(100),
  remainingPercent: z.number().min(0).max(100),
  windowMinutes: z.number().int().positive().nullable(),
  resetsAt: isoDateSchema.nullable(),
});

export const accountUsageSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  email: z.string().email().nullable(),
  plan: z.string().min(1).nullable(),
  windows: z.array(usageWindowSchema),
  resetCredits: z.array(resetCreditSchema).default([]),
});

export const providerUsageSchema = z.object({
  providerId: z.enum(["codex", "opencode", "claude"]),
  providerName: z.string().min(1),
  // `disabled` bedeutet: Die Limitüberwachung für diesen Anbieter ist über die
  // Einstellungen pauschal ausgeschaltet — kein Fehler, sondern eine bewusste Wahl.
  status: z.enum(["available", "partial", "unavailable", "disabled"]),
  updatedAt: isoDateSchema.nullable(),
  accounts: z.array(accountUsageSchema),
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).nullable(),
});

export const usageResponseSchema = z.object({
  providers: z.array(providerUsageSchema),
  fetchedAt: isoDateSchema,
  lastSuccessfulFetchAt: isoDateSchema.nullable(),
  cached: z.boolean(),
});

export const usageProviderIdSchema = z.enum(["codex", "opencode", "claude"]);

export const usageRangeSchema = z.enum(["7d", "30d", "90d", "365d", "all"]);

// Limitüberwachung je Werkzeug. Steht ein Anbieter auf false, werden seine
// Limitfenster weder abgerufen noch gespeichert und in der Oberfläche als
// deaktiviert ausgewiesen. Defaults: alle drei überwacht.
export const usageMonitoringSchema = z.object({
  codex: z.boolean().default(true),
  opencode: z.boolean().default(true),
  claude: z.boolean().default(true),
});

export const usageMonitoringResponseSchema = z.object({
  monitoring: usageMonitoringSchema,
});

export type UsageMonitoring = z.infer<typeof usageMonitoringSchema>;

export const usageDailyPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheCreationTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCost: z.number().nonnegative(),
});

export const usageBreakdownSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  totalTokens: z.number().int().nonnegative(),
  totalCost: z.number().nonnegative(),
  quality: z.enum(["exact", "derived", "unknown"]).default("exact"),
});

export const usageForecastSchema = z.object({
  providerId: usageProviderIdSchema,
  accountId: z.string().min(1),
  accountLabel: z.string().min(1),
  windowId: z.enum(["primary", "secondary", "tertiary"]),
  windowLabel: z.string().min(1),
  resetsAt: isoDateSchema,
  predictedUsedPercentAtReset: z.number().min(0),
  reachesLimitAt: isoDateSchema.nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  sampleCount: z.number().int().nonnegative(),
  message: z.string().min(1),
});

export const usageDashboardResponseSchema = z.object({
  live: usageResponseSchema,
  range: usageRangeSchema,
  daily: z.array(usageDailyPointSchema),
  projects: z.array(usageBreakdownSchema),
  projectRange: z.union([z.literal("365d"), z.literal("all")]),
  models: z.array(usageBreakdownSchema),
  forecasts: z.array(usageForecastSchema),
  resetCredits: z.record(z.string(), z.array(resetCreditSchema)),
  totals: z.object({
    totalTokens: z.number().int().nonnegative(),
    totalCost: z.number().nonnegative(),
    todayTokens: z.number().int().nonnegative(),
    projected30DayTokens: z.number().int().nonnegative(),
    projected30DayCost: z.number().nonnegative(),
  }),
  historyStartedAt: isoDateSchema.nullable(),
});

// Timeline-Lane für die Multi-Account-Limitübersicht. Jede Lane steht für genau
// einen Account eines Providers. Die Limitfenster nutzen die bestehende
// UsageWindow-Struktur unverändert, damit es kein zweites Fenstermodell gibt.
export const usageTimelineStatusSchema = z.enum(["available", "partial", "stale", "unavailable", "disabled"]);

export const usageTimelineLaneSchema = z.object({
  providerId: usageProviderIdSchema,
  // ManagedAccount-ID oder bei reinen CodexBar-Daten ein deterministischer Hash
  // aus Provider, Profilpfad, Label und E-Mail — niemals positionsabhängig.
  accountId: z.string().min(1),
  accountLabel: z.string().min(1),
  email: z.string().email().nullable(),
  plan: z.string().min(1).nullable(),
  active: z.boolean(),
  windows: z.array(usageWindowSchema),
  resetCredits: z.array(resetCreditSchema),
  status: usageTimelineStatusSchema,
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).nullable(),
  updatedAt: isoDateSchema.nullable(),
});

export const usageTimelineResponseSchema = z.object({
  lanes: z.array(usageTimelineLaneSchema),
  fetchedAt: isoDateSchema,
  lastSuccessfulFetchAt: isoDateSchema.nullable(),
});

// Sichtbare Sync-Fehler je Zweig (D-014): Meldung plus Alter statt Stille.
export const usageSyncBranchErrorSchema = z.object({ message: z.string().min(1).max(500), at: isoDateSchema });

export const usageSyncStatusSchema = z.object({ running: z.boolean(), liveRunning: z.boolean().default(false), lastCompletedAt: isoDateSchema.nullable(), limitsError: usageSyncBranchErrorSchema.nullable().default(null), analyticsError: usageSyncBranchErrorSchema.nullable().default(null), branchErrors: z.record(z.string(), z.object({ count: z.number().int().nonnegative(), lastMessage: z.string().min(1).max(500), lastAt: isoDateSchema })).default({}) });

export type UsageWindow = z.infer<typeof usageWindowSchema>;

export type AccountUsage = z.infer<typeof accountUsageSchema>;

export type ProviderUsage = z.infer<typeof providerUsageSchema>;

export type UsageResponse = z.infer<typeof usageResponseSchema>;

export type UsageProviderId = z.infer<typeof usageProviderIdSchema>;

export type UsageRange = z.infer<typeof usageRangeSchema>;

export type UsageDailyPoint = z.infer<typeof usageDailyPointSchema>;

export type UsageBreakdown = z.infer<typeof usageBreakdownSchema>;

export type UsageForecast = z.infer<typeof usageForecastSchema>;

export type UsageDashboardResponse = z.infer<typeof usageDashboardResponseSchema>;

export type UsageTimelineStatus = z.infer<typeof usageTimelineStatusSchema>;

export type UsageTimelineLane = z.infer<typeof usageTimelineLaneSchema>;

export type UsageTimelineResponse = z.infer<typeof usageTimelineResponseSchema>;
