import { z } from "zod";

const resetTimestampSchema = z.iso.datetime({ offset: true });

export const codexResetHistorySettingsSchema = z.object({
  enabled: z.boolean().default(false),
});

export const codexResetHistorySettingsResponseSchema = z.object({
  settings: codexResetHistorySettingsSchema,
});

export const codexResetTypeSchema = z.enum(["regular", "banked"]);

export const codexResetHistoryItemSchema = z.object({
  id: z.string().min(1),
  resetType: codexResetTypeSchema,
  announcedAt: resetTimestampSchema,
  text: z.string(),
  sourceUrl: z.url(),
});

export const codexResetHistoryStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  lastResetAt: resetTimestampSchema.nullable(),
  daysSinceLast: z.number().nonnegative().nullable(),
  averageIntervalDays: z.number().nonnegative().nullable(),
});

export const codexResetHistoryResponseSchema = z.object({
  enabled: z.boolean(),
  status: z.enum(["disabled", "available", "stale", "unavailable"]),
  resets: z.array(codexResetHistoryItemSchema).max(100),
  stats: codexResetHistoryStatsSchema,
  fetchedAt: resetTimestampSchema.nullable(),
  lastSuccessfulFetchAt: resetTimestampSchema.nullable(),
  error: z.string().nullable(),
});

export type CodexResetHistorySettings = z.infer<typeof codexResetHistorySettingsSchema>;
export type CodexResetHistoryItem = z.infer<typeof codexResetHistoryItemSchema>;
export type CodexResetHistoryResponse = z.infer<typeof codexResetHistoryResponseSchema>;
