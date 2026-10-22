import { z } from "zod";
import { hermesV2ResourceScopeSchema } from "./hermes-v2-resources.js";

export const hermesV2ConfigurationValuesSchema = z.strictObject({
  timezone: z.string().max(100).nullable(),
  maxTurns: z.number().int().min(1).max(10_000).nullable(),
  compressionEnabled: z.boolean().nullable(),
});
export const hermesV2ConfigurationSchema = z.strictObject({
  scope: hermesV2ResourceScopeSchema,
  profile: z.string().min(1).max(200),
  model: z.string().max(500).nullable(),
  approvalMode: z.string().max(40).nullable(),
  values: hermesV2ConfigurationValuesSchema,
});
export const hermesV2ConfigurationUpdateSchema = z.strictObject({
  scope: hermesV2ResourceScopeSchema,
  expected: hermesV2ConfigurationValuesSchema,
  changes: z.strictObject({
    timezone: z.string().trim().max(100).optional(),
    maxTurns: z.number().int().min(1).max(10_000).optional(),
    compressionEnabled: z.boolean().optional(),
  }).refine((value) => Object.keys(value).length > 0, "Keine Änderung angegeben."),
});
export type HermesV2Configuration = z.infer<typeof hermesV2ConfigurationSchema>;
export type HermesV2ConfigurationUpdate = z.infer<typeof hermesV2ConfigurationUpdateSchema>;
