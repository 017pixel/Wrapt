import type { HermesV2Organization } from "@wrapt/contracts/hermes-v2";
import type { FactRow, MetadataRow, OrganizationRepository } from "./repository.js";
import { equalSourceIds } from "./equality.js";

const unreadClause = `NOT EXISTS (SELECT 1 FROM hermes_v2_read_acks a WHERE a.owner_id=? AND a.source_id IN (${equalSourceIds("s.id")}))`;
const relevantClause = `(s.namespace='error' OR (s.available=1 AND (?=0 OR (f.change_cursor>? AND (f.completed_at IS NULL OR f.completed_at>=?)) OR
 COALESCE((SELECT revision FROM hermes_v2_source_availability av WHERE av.source_id=s.id AND av.scope=ss.scope AND av.session_id=ss.session_id),
 CASE WHEN s.session_id=ss.session_id THEN s.availability_revision ELSE 0 END)>?)))`;

export function organizationView(repo: OrganizationRepository, owner: string, scope: string, session: string, now: number): HermesV2Organization {
  const row = repo.metadata(owner, scope, session, now);
  const coverage = repo.coverage(scope, session);
  const organizedAt = Math.max(row.snoozed_at ?? 0, row.settled_at ?? 0);
  const aggregate = repo.one<{ unread_count: number; new_fact: number }>(`SELECT
    COALESCE(SUM(CASE WHEN ${relevantClause} AND ${unreadClause} THEN 1 ELSE 0 END),0) unread_count,
    COALESCE(MAX(CASE WHEN f.change_cursor>? AND (f.completed_at IS NULL OR f.completed_at>=?) THEN 1 ELSE 0 END),0) new_fact
    FROM hermes_v2_attention_facts f JOIN hermes_v2_sources s ON s.id=f.source_id JOIN hermes_v2_source_sessions ss ON ss.source_id=s.id WHERE ss.scope=? AND ss.session_id=?`,
    organizedAt, row.organization_cursor, organizedAt, row.organization_coverage_revision, owner, row.organization_cursor, organizedAt, scope, session)!;
  const last = repo.one<FactRow & { is_relevant: number; is_unread: number }>(`SELECT s.*,f.id fact_id,f.kind,f.change_cursor,f.observed_at,f.completed_at,
    ${relevantClause} is_relevant,${unreadClause} is_unread
    FROM hermes_v2_attention_facts f JOIN hermes_v2_sources s ON s.id=f.source_id JOIN hermes_v2_source_sessions ss ON ss.source_id=s.id
    WHERE ss.scope=? AND ss.session_id=?
    ORDER BY is_relevant DESC,is_unread DESC,CASE WHEN s.namespace='error' THEN 0 ELSE 1 END,f.change_cursor DESC LIMIT 1`, organizedAt, row.organization_cursor, organizedAt, row.organization_coverage_revision, owner, scope, session);
  const latest = last ? { id: last.fact_id, kind: last.kind, unread: last.is_unread === 1, relevant: last.is_relevant === 1,
    observedAt: last.observed_at, completedAt: last.completed_at } : null;
  const coverageWake = coverage.revision > row.organization_coverage_revision;
  const effective = !aggregate.new_fact && !coverageWake;
  return { sessionId: session, revision: row.revision, pinRevision: repo.lists(owner, scope).revision, pinRank: row.pin_rank,
    snoozedAt: row.snoozed_at, snoozedUntil: row.snoozed_until, settledAt: row.settled_at,
    effectiveSnoozedUntil: effective && row.snoozed_until !== null && row.snoozed_until > now ? row.snoozed_until : null,
    effectiveSettledAt: effective ? row.settled_at : null,
    organizationCursor: row.organization_cursor, organizationCoverageRevision: row.organization_coverage_revision,
    attention: { unreadCount: aggregate.unread_count, requiresAttention: aggregate.unread_count > 0 || coverageWake, latest },
    coverage: { state: coverage.state, revision: coverage.revision, reason: coverage.reason }, serverNow: now };
}
export const metadataFields = (row: MetadataRow) => ({ pin_rank: row.pin_rank, snoozed_at: row.snoozed_at,
  snoozed_until: row.snoozed_until, settled_at: row.settled_at, organization_cursor: row.organization_cursor,
  organization_coverage_revision: row.organization_coverage_revision });
