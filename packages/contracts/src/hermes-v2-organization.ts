import { z } from "zod";
import { hermesV2IdSchema } from "./hermes-v2-sessions.js";

const revision = z.number().int().nonnegative();
const time = z.number().finite().nonnegative();
export const hermesV2ReadEvidenceSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const hermesV2OrganizationGroupSchema = z.enum(["pinned", "snoozed", "settled"]);
export const hermesV2FactSchema = z.strictObject({
  id: z.string().uuid(), kind: z.enum(["live-turn-end", "new-answer", "decision-error"]),
  unread: z.boolean(), relevant: z.boolean(), observedAt: time, completedAt: time.nullable(),
});
export const hermesV2OrganizationSchema = z.strictObject({
  sessionId: hermesV2IdSchema, revision, pinRevision: revision, pinRank: z.number().int().nonnegative().nullable(),
  snoozedAt: time.nullable(), snoozedUntil: time.nullable(), settledAt: time.nullable(),
  effectiveSnoozedUntil: time.nullable(), effectiveSettledAt: time.nullable(),
  organizationCursor: revision, organizationCoverageRevision: revision,
  attention: z.strictObject({ unreadCount: revision, requiresAttention: z.boolean(), latest: hermesV2FactSchema.nullable() }),
  coverage: z.strictObject({ state: z.enum(["baseline", "anchored", "gap", "identity-unknown"]), revision, reason: z.string().max(100).nullable() }),
  serverNow: time,
});
export const hermesV2OrganizationBatchSchema = z.array(hermesV2OrganizationSchema).max(100);
export const hermesV2ReadAckSchema = z.strictObject({
  sessionId: hermesV2IdSchema, evidence: z.array(hermesV2ReadEvidenceSchema).min(1).max(64),
});
export const hermesV2ReadResultSchema = z.strictObject({
  revision, acknowledgedSources: revision, pendingSources: revision,
  readFactIds: z.array(z.string().uuid()).max(4096), serverNow: time,
});
const actionBase = z.strictObject({ sessionId: hermesV2IdSchema, expectedRevision: revision });
export const hermesV2OrganizeSchema = z.discriminatedUnion("action", [
  actionBase.extend({ action: z.literal("snooze"), snoozedUntil: time }),
  ...(["pin", "unpin", "wake", "settle", "unsettle"] as const).map((action) => actionBase.extend({ action: z.literal(action) })),
]);
export const hermesV2ReorderSchema = z.strictObject({
  expectedPinRevision: revision,
  entries: z.array(z.strictObject({ sessionId: hermesV2IdSchema, expectedRevision: revision })).max(1000),
});
export const hermesV2UndoSchema = z.strictObject({ handle: hermesV2ReadEvidenceSchema });
export const hermesV2OrganizationMutationSchema = z.strictObject({
  items: z.array(hermesV2OrganizationSchema).max(1000),
  undo: z.strictObject({ handle: hermesV2ReadEvidenceSchema, expiresAt: time }).nullable(), serverNow: time,
});
export const hermesV2OrganizationConflictSchema = z.strictObject({
  code: z.literal("ORGANIZATION_CONFLICT"), items: z.array(hermesV2OrganizationSchema).max(1000),
  pinRevision: revision, serverNow: time,
});
export const hermesV2MembersPageSchema = z.strictObject({
  group: hermesV2OrganizationGroupSchema, items: z.array(hermesV2OrganizationSchema).max(100),
  nextCursor: z.string().max(512).nullable(), hasMore: z.boolean(), pinRevision: revision,
  membershipRevision: revision, serverNow: time,
});
export const hermesV2HistoricalNoticeSchema = z.strictObject({
  id: z.string().uuid(), kind: z.enum(["historical-decision-error", "unavailable-content"]),
  observedAt: time, completedAt: time.nullable(), readEvidence: hermesV2ReadEvidenceSchema.nullable(),
});
export const hermesV2NoticesPageSchema = z.strictObject({
  sessionId: hermesV2IdSchema, items: z.array(hermesV2HistoricalNoticeSchema).max(100),
  nextCursor: z.string().max(512).nullable(), hasMore: z.boolean(), serverNow: time,
});
export type HermesV2Organization = z.infer<typeof hermesV2OrganizationSchema>;
export type HermesV2Fact = z.infer<typeof hermesV2FactSchema>;
export type HermesV2ReadAck = z.infer<typeof hermesV2ReadAckSchema>;
export type HermesV2ReadResult = z.infer<typeof hermesV2ReadResultSchema>;
export type HermesV2Organize = z.infer<typeof hermesV2OrganizeSchema>;
export type HermesV2Reorder = z.infer<typeof hermesV2ReorderSchema>;
export type HermesV2OrganizationMutation = z.infer<typeof hermesV2OrganizationMutationSchema>;
export type HermesV2MembersPage = z.infer<typeof hermesV2MembersPageSchema>;
export type HermesV2NoticesPage = z.infer<typeof hermesV2NoticesPageSchema>;
export type HermesV2OrganizationGroup = z.infer<typeof hermesV2OrganizationGroupSchema>;
