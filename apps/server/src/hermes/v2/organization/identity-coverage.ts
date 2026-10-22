import type { OrganizationRepository } from "./repository.js";

/** Inhaltsfreie, monotone Materialmenge. Ein Rowkonflikt ersetzt keinen anderen Identitätsmangel. */
export function recordMissingIdentity(repo: OrganizationRepository, scope: string, session: string, row: unknown, position: number): void {
  const physical = typeof row === "number" && Number.isSafeInteger(row) && row > 0;
  // Eine bereits gesperrte physische Row ist schon durch den Konfliktsatz erfasst.
  if (physical && repo.one("SELECT 1 FROM hermes_v2_row_conflicts WHERE scope=? AND row_id=?", scope, row)) return;
  const key = physical ? `row:${row}` : `position:${position}`;
  repo.run("INSERT OR IGNORE INTO hermes_v2_missing_identities VALUES(?,?,?)", scope, session, key);
}

export function identityCoverage(repo: OrganizationRepository, scope: string, session: string): { conflicts: number; signature: string } {
  const conflicts = repo.one<{ count: number }>("SELECT COUNT(*) count FROM hermes_v2_row_conflict_sessions WHERE scope=? AND session_id=?", scope, session)!.count;
  const missing = repo.one<{ count: number }>("SELECT COUNT(*) count FROM hermes_v2_missing_identities WHERE scope=? AND session_id=?", scope, session)!.count;
  return { conflicts, signature: `identity:${conflicts}:${missing}` };
}

export function projectRowConflicts(repo: OrganizationRepository, scope: string, session: string, now: number): void {
  const identity = identityCoverage(repo, scope, session);
  repo.setCoverage(scope, session, "identity-unknown", "ROW_IDENTITY_CHANGED", identity.signature, now);
}
