import { object } from "../normalize-values.js";
import { logicalId } from "../history-identities.js";
import type { OrganizationRepository, SourceRow } from "./repository.js";
import { equalSourceIds } from "./equality.js";
import { projectRowConflicts } from "./identity-coverage.js";

export function terminalAnswerContent(value: unknown): boolean {
  const row = object(value);
  const content = object(row.display_metadata).display_text ?? row.display_content ?? row.text ?? row.content;
  const calls = row.tool_calls;
  return row.role === "assistant" && typeof content === "string" && !!content.trim()
    && row.finish_reason === "stop" && (!calls || (Array.isArray(calls) && calls.length === 0))
    && !["hidden", "summary", "commentary", "scaffold", "verification", "reasoning"].includes(String(row.display_kind ?? ""));
}
export const terminalAnswer = (value: unknown): boolean => terminalAnswerContent(value) && logicalId(object(value).message_uid) !== null;
export function rowWitness(repo: OrganizationRepository, scope: string, session: string, row: number): string | null {
  if (repo.one("SELECT 1 FROM hermes_v2_row_conflicts WHERE scope=? AND row_id=?", scope, row)) return null;
  return repo.one<{ uid: string }>("SELECT uid FROM hermes_v2_row_witnesses WHERE scope=? AND session_id=? AND row_id=?", scope, session, row)?.uid ?? null;
}
export function answerSource(repo: OrganizationRepository, scope: string, session: string, value: unknown, now: number): SourceRow | null {
  const row = object(value);
  const uid = logicalId(row.message_uid);
  const id = row.id ?? row.row_id ?? row._row_id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  const witnessed = repo.one("SELECT 1 FROM hermes_v2_row_witnesses WHERE scope=? AND row_id=?", scope, id);
  const different = uid !== null && repo.one("SELECT 1 FROM hermes_v2_row_witnesses WHERE scope=? AND row_id=? AND uid<>?", scope, id, uid);
  if ((witnessed && (!uid || different)) || repo.one("SELECT 1 FROM hermes_v2_row_conflicts WHERE scope=? AND row_id=?", scope, id)) {
    // Physische Row-IDs sind nach nachgewiesener Wiederverwendung dauerhaft kein Aliasbeleg mehr.
    repo.run("INSERT OR IGNORE INTO hermes_v2_row_conflicts VALUES(?,?)", scope, id);
    const projections = repo.all<{ session_id: string }>("SELECT DISTINCT session_id FROM hermes_v2_row_witnesses WHERE scope=? AND row_id=?", scope, id);
    for (const affected of new Set([session, ...projections.map((item) => item.session_id)])) {
      repo.run("INSERT OR IGNORE INTO hermes_v2_row_conflict_sessions VALUES(?,?,?)", scope, affected, id);
      // Derselbe bekannte Konflikt ist keine neue Abdeckung bei jedem Wechsel der Projektion/UID.
      projectRowConflicts(repo, scope, affected, now);
    }
    return null;
  }
  if (row.role !== "assistant" || !uid
    || ["hidden", "summary", "commentary", "scaffold", "verification", "reasoning"].includes(String(row.display_kind ?? ""))) return null;
  repo.run("INSERT OR IGNORE INTO hermes_v2_row_witnesses VALUES(?,?,?,?)", scope, session, id, uid);
  const source = repo.source(scope, session, "answer", `uid:${uid}`, { uid, row_id: id });
  for (const event of repo.all<SourceRow>("SELECT * FROM hermes_v2_sources WHERE scope=? AND session_id=? AND namespace='answer' AND row_id=? AND uid IS NULL", scope, session, id)) linkEqual(repo, event, source, now);
  return source;
}
export function linkEqual(repo: OrganizationRepository, left: SourceRow, right: SourceRow, now: number): void {
  if (left.id === right.id || left.namespace !== "answer" || right.namespace !== "answer" || left.scope !== right.scope
    || repo.context(left.scope, left.session_id) !== repo.context(right.scope, right.session_id)) return;
  const exists = repo.one("SELECT 1 FROM hermes_v2_source_links WHERE from_id=? AND to_id=? AND kind='equal'", left.id, right.id);
  if (exists) return;
  repo.run("INSERT OR IGNORE INTO hermes_v2_source_links VALUES(?,?,'equal')", left.id, right.id);
  const component = equalSourceIds("?");
  const facts = repo.all<{ id: string; source_id: string; kind: string }>(`SELECT id,source_id,kind FROM hermes_v2_attention_facts WHERE source_id IN (${component}) ORDER BY change_cursor`, left.id);
  if (facts.length > 1) {
    for (const duplicate of facts.slice(1)) repo.run("DELETE FROM hermes_v2_attention_facts WHERE id=?", duplicate.id);
    if (facts.some((fact) => fact.kind === "live-turn-end")) repo.run("UPDATE hermes_v2_attention_facts SET kind='live-turn-end' WHERE id=?", facts[0]!.id);
  }
  if (facts.length) repo.run(`INSERT OR IGNORE INTO hermes_v2_source_sessions(source_id,scope,session_id)
    SELECT ?,scope,session_id FROM hermes_v2_source_sessions WHERE source_id IN (${component})`, facts[0]!.source_id, left.id);
  repo.sourceTouch(left, now);
  repo.sourceTouch(right, now);
}
export function projectedSources(repo: OrganizationRepository, source: SourceRow, raw: unknown, session = source.session_id): string[] {
  let absorbed: unknown = object(raw).absorbed_message_uids;
  if (typeof absorbed === "string" && absorbed.length <= 65_536) {
    try { absorbed = JSON.parse(absorbed); } catch { absorbed = []; }
  }
  const ids = [source.id];
  if (Array.isArray(absorbed)) for (const candidate of absorbed.slice(0, 65)) {
    const uid = logicalId(candidate);
    if (!uid) continue;
    const known = repo.source(source.scope, session, "answer", `uid:${uid}`, { uid });
    if (known.id !== source.id) {
      repo.run("INSERT OR IGNORE INTO hermes_v2_source_links VALUES(?,?,'covers')", source.id, known.id);
      ids.push(known.id);
    }
  }
  return [...new Set(ids)];
}
