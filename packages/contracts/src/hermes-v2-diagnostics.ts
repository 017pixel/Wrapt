import { z } from "zod";
import { hermesV2ResourceScopeSchema, hermesV2ResourceTextSchema } from "./hermes-v2-resources.js";

export const hermesV2DiagnosticsSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema,
  connection: z.strictObject({ state: z.enum(["connecting", "online", "reconnecting", "offline", "incompatible", "unavailable"]),
    epoch: z.string().max(200).nullable(), subscriptions: z.number().int().nonnegative(), protectedRuntime: z.boolean() }),
  dashboard: z.strictObject({ reachable: z.boolean(), version: z.string().max(200).nullable(), gatewayState: z.string().max(200).nullable(), error: z.string().max(2000).nullable() }),
  update: z.strictObject({ phase: z.string().max(100).nullable(), pending: z.boolean().nullable(), lastResult: z.string().max(200).nullable(),
    lastCheckedAt: z.string().max(100).nullable(), logTail: hermesV2ResourceTextSchema }),
  logs: hermesV2ResourceTextSchema, truncated: z.boolean(), adminPath: z.literal("/hermes") });
export type HermesV2Diagnostics = z.infer<typeof hermesV2DiagnosticsSchema>;
