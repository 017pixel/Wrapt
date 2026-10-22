import { z } from "zod";

export const hermesV2EffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
export const hermesV2ApprovalModeSchema = z.enum(["manual", "smart", "off"]);
export const hermesV2ComposerSettingsSchema = z.strictObject({
  reasoning: z.strictObject({ effort: z.string().max(40).nullable(), wire: z.string().max(40).nullable() }),
  approvals: z.strictObject({ mode: hermesV2ApprovalModeSchema.nullable(), effectiveBypass: z.boolean().nullable(),
    scope: z.literal("global"), editable: z.boolean(),
    options: z.array(z.strictObject({ mode: hermesV2ApprovalModeSchema, available: z.boolean() })).max(3).default([]) }),
});
export type HermesV2Effort = z.infer<typeof hermesV2EffortSchema>;
export type HermesV2ComposerSettings = z.infer<typeof hermesV2ComposerSettingsSchema>;
