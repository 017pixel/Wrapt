import { z } from "zod";
import type { HermesV2MembersPage, HermesV2NoticesPage, HermesV2OrganizationGroup } from "@wrapt/contracts/hermes-v2";
import { OrganizationConflict } from "./actions.js";
import { OrganizationError } from "./errors.js";
import type { EvidenceRegistry } from "./evidence.js";
import type { FactRow, MetadataRow, OrganizationRepository } from "./repository.js";
import { organizationView } from "./views.js";
import { createHash } from "node:crypto";

const cursorSchema = z.strictObject({ v: z.literal(1), group: z.enum(["pinned", "snoozed", "settled"]),
  offset: z.number().int().min(0).max(1_000_000), revision: z.number().int().nonnegative(), pins: z.number().int().nonnegative(), context: z.string().length(64) });
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const contextId = (owner: string, scope: string) => createHash("sha256").update(JSON.stringify([owner, scope])).digest("hex");
function decode(value: string): unknown {
  try { if (value.length > 512) throw new Error(); return JSON.parse(Buffer.from(value, "base64url").toString()); }
  catch { throw new OrganizationError(400, "INVALID_CURSOR", "Der Seitencursor ist nicht gültig."); }
}
export function members(repo: OrganizationRepository, owner: string, scope: string, group: HermesV2OrganizationGroup, cursor: string | undefined, limit: number, now: number): HermesV2MembersPage {
  const lists = repo.lists(owner, scope);
  let offset = 0;
  if (cursor) {
    const parsed = cursorSchema.safeParse(decode(cursor));
    if (!parsed.success || parsed.data.group !== group || parsed.data.context !== contextId(owner, scope)) throw new OrganizationError(400, "INVALID_CURSOR", "Der Cursor gehört nicht zu dieser Liste.");
    if (parsed.data.revision !== lists.membership_revision || (group === "pinned" && parsed.data.pins !== lists.revision)) throw new OrganizationConflict([], lists.revision, now);
    offset = parsed.data.offset;
  }
  const clauses = { pinned: "pin_rank IS NOT NULL", snoozed: "snoozed_until IS NOT NULL", settled: "settled_at IS NOT NULL" };
  const orders = { pinned: "pin_rank,session_id", snoozed: "snoozed_until,session_id", settled: "settled_at DESC,session_id" };
  const rows = repo.all<MetadataRow>(`SELECT * FROM hermes_v2_session_metadata WHERE owner_id=? AND scope=? AND ${clauses[group]} ORDER BY ${orders[group]} LIMIT ? OFFSET ?`, owner, scope, limit + 1, offset);
  const items = rows.slice(0, limit).map((row) => organizationView(repo, owner, scope, row.session_id, now))
    .filter((row) => group === "pinned" || (group === "snoozed" ? row.effectiveSnoozedUntil !== null : row.effectiveSettledAt !== null));
  const hasMore = rows.length > limit;
  return { group, items, hasMore, nextCursor: hasMore ? encode({ v: 1, group, offset: offset + limit, revision: lists.membership_revision, pins: lists.revision, context: contextId(owner, scope) }) : null,
    membershipRevision: lists.membership_revision, pinRevision: lists.revision, serverNow: now };
}
export function notices(repo: OrganizationRepository, evidence: EvidenceRegistry, owner: string, scope: string, session: string, cursor: string | undefined, limit: number, now: number): HermesV2NoticesPage {
  let before = Number.MAX_SAFE_INTEGER;
  if (cursor) {
    const parsed = z.strictObject({ v: z.literal(1), session: z.string(), before: z.number().int().positive(), context: z.string().length(64) }).safeParse(decode(cursor));
    if (!parsed.success || parsed.data.session !== session || parsed.data.context !== contextId(owner, scope)) throw new OrganizationError(400, "INVALID_CURSOR", "Der Cursor gehört nicht zu dieser Sitzung.");
    before = parsed.data.before;
  }
  const rows = repo.all<FactRow>(`SELECT s.*,f.id fact_id,f.kind,f.change_cursor,f.observed_at,f.completed_at
    FROM hermes_v2_attention_facts f JOIN hermes_v2_sources s ON s.id=f.source_id JOIN hermes_v2_source_sessions ss ON ss.source_id=s.id
    WHERE ss.scope=? AND ss.session_id=? AND f.change_cursor<? AND (s.namespace='error' OR s.available=0)
    ORDER BY f.change_cursor DESC LIMIT ?`, scope, session, before, limit + 1);
  const selected = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return { sessionId: session, items: selected.map((row) => ({ id: row.fact_id,
    kind: row.namespace === "error" ? "historical-decision-error" : "unavailable-content",
    observedAt: row.observed_at, completedAt: row.completed_at,
    readEvidence: row.namespace === "error" ? evidence.evidence(owner, scope, session, [row.id]) : null })),
    nextCursor: hasMore ? encode({ v: 1, session, before: selected.at(-1)!.change_cursor, context: contextId(owner, scope) }) : null, hasMore, serverNow: now };
}
