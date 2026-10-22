import { z } from "zod";
import { hermesV2IdSchema, hermesV2SessionSchema } from "./hermes-v2-sessions.js";

const count = z.number().int().nonnegative().nullable();
export const hermesV2ActivitySchema = z.strictObject({
  state: z.enum(["working", "starting", "waiting_input", "idle", "unknown"]),
  turnStartedAt: z.number().finite().nonnegative().nullable(), openRequestCount: count,
  subagentCount: count, backgroundCount: count, observedAt: z.number().nonnegative(),
  coverage: z.enum(["observed", "partial"]),
});
const activity = z.record(hermesV2IdSchema, hermesV2ActivitySchema).refine((value) => Object.keys(value).length <= 100);
export const hermesV2CatalogQuerySchema = z.strictObject({
  offset: z.coerce.number().int().min(0).max(5000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  q: z.string().max(200).optional(), projectId: hermesV2IdSchema.optional(),
});
export const hermesV2SummaryPageSchema = z.strictObject({
  sessions: z.array(hermesV2SessionSchema).max(100), activity,
  offset: z.number().int().nonnegative(), limit: z.number().int().min(1).max(100),
  nextOffset: z.number().int().nonnegative().nullable(), hasMore: z.boolean(),
  coverage: z.enum(["partial", "complete"]), serverNow: z.number().nonnegative(),
});
export const hermesV2SummaryLookupSchema = z.strictObject({ sessionIds: z.array(hermesV2IdSchema).min(1).max(100) });
export const hermesV2SummaryLookupResultSchema = z.strictObject({
  sessions: z.array(hermesV2SessionSchema).max(100), activity,
  missingSessionIds: z.array(hermesV2IdSchema).max(100), serverNow: z.number().nonnegative(),
});
export type HermesV2Activity = z.infer<typeof hermesV2ActivitySchema>;
export type HermesV2CatalogQuery = z.infer<typeof hermesV2CatalogQuerySchema>;
export type HermesV2SummaryPage = z.infer<typeof hermesV2SummaryPageSchema>;
export type HermesV2SummaryLookupResult = z.infer<typeof hermesV2SummaryLookupResultSchema>;
