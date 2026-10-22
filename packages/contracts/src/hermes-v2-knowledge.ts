import { z } from "zod";
import { hermesV2ResourceScopeSchema, hermesV2ResourceTextSchema } from "./hermes-v2-resources.js";

export const hermesV2MemorySchema = z.strictObject({ scope: hermesV2ResourceScopeSchema, active: z.string().max(100).nullable(),
  providers: z.array(z.strictObject({ name: z.string().max(100), description: z.string().max(2000), available: z.boolean().nullable(),
    configured: z.boolean().nullable(), status: z.string().max(500).nullable(), setup: z.string().max(4000).nullable() })).max(100),
  files: z.array(hermesV2ResourceTextSchema.extend({ name: z.enum(["MEMORY.md", "USER.md"]) })).max(2),
  builtinOnly: z.literal(true), truncated: z.boolean() });
export const hermesV2PendingSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema,
  records: z.array(z.strictObject({ id: z.string().regex(/^[a-f0-9]{8}$/), subsystem: z.enum(["memory", "skills"]),
    status: z.enum(["pending", "unknown"]), action: z.string().max(100).nullable(), summary: z.string().max(4000).nullable(),
    origin: z.enum(["foreground", "background_review"]).nullable(), createdAt: z.number().nonnegative().nullable(),
    payload: hermesV2ResourceTextSchema, matchedEntryComplete: z.boolean(), truncated: z.boolean() })).max(100),
  coverage: z.enum(["bounded", "partial"]), truncated: z.boolean(), review: z.strictObject({ supported: z.literal(false), adminPath: z.literal("/hermes") }) });
export const hermesV2ResourceSkillSchema = z.strictObject({ name: z.string().min(1).max(200), description: z.string().max(4000),
  enabled: z.boolean().nullable(), usage: z.number().nonnegative().nullable(), provenance: z.enum(["hub", "bundled", "external", "agent", "unknown"]),
  slashCommand: z.string().max(200).nullable(), readOnly: z.literal(true) });
export const hermesV2ResourceSkillsSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema, skills: z.array(hermesV2ResourceSkillSchema).max(500),
  truncated: z.boolean(), editorPath: z.literal("/ki-skills") });
export const hermesV2ResourceSkillDetailSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema, skill: hermesV2ResourceSkillSchema,
  content: hermesV2ResourceTextSchema, editorPath: z.literal("/ki-skills") });
export type HermesV2Memory = z.infer<typeof hermesV2MemorySchema>;
export type HermesV2Pending = z.infer<typeof hermesV2PendingSchema>;
export type HermesV2ResourceSkill = z.infer<typeof hermesV2ResourceSkillSchema>;
export type HermesV2ResourceSkills = z.infer<typeof hermesV2ResourceSkillsSchema>;
export type HermesV2ResourceSkillDetail = z.infer<typeof hermesV2ResourceSkillDetailSchema>;
