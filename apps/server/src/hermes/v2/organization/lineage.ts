import { hermesV2IdSchema } from "@wrapt/contracts/hermes-v2";
import { object } from "../normalize-values.js";
import type { OrganizationRepository, SourceRow } from "./repository.js";
import { linkEqual } from "./sources.js";

/** Nur vom Core ausdrücklich als Compression-Projektion gelieferte Ketten verbinden. */
export function confirmLineage(repo: OrganizationRepository, scope: string, value: unknown, now: number): void {
  const row = object(value);
  const root = hermesV2IdSchema.safeParse(row._lineage_root_id);
  const ids = Array.isArray(row._lineage_ids) ? row._lineage_ids : [];
  if (!root.success || ids.length < 2 || ids.length > 1000 || ids[0] !== root.data || !ids.includes(row.id)
    || ids.some((id) => !hermesV2IdSchema.safeParse(id).success) || new Set(ids).size !== ids.length) return;
  repo.transaction(() => {
    for (const id of ids as string[]) {
      const prior = repo.context(scope, id);
      if (prior !== id && prior !== root.data) {
        repo.setCoverage(scope, id, "identity-unknown", "LINEAGE_IDENTITY_CHANGED", root.data, now);
        return;
      }
    }
    for (const id of ids as string[]) repo.run("INSERT OR IGNORE INTO hermes_v2_session_contexts VALUES(?,?,?)", scope, id, root.data);
    const duplicates = repo.all<{ source_key: string }>(`SELECT s.source_key FROM hermes_v2_sources s JOIN hermes_v2_session_contexts c
      ON c.scope=s.scope AND c.session_id=s.session_id WHERE s.scope=? AND c.root_id=? AND s.namespace='answer' GROUP BY s.source_key HAVING COUNT(*)>1 LIMIT 512`, scope, root.data);
    for (const duplicate of duplicates) {
      const sources = repo.all<SourceRow>(`SELECT s.* FROM hermes_v2_sources s JOIN hermes_v2_session_contexts c ON c.scope=s.scope AND c.session_id=s.session_id
        WHERE s.scope=? AND c.root_id=? AND s.namespace='answer' AND s.source_key=? LIMIT 1000`, scope, root.data, duplicate.source_key);
      for (const source of sources.slice(1)) linkEqual(repo, sources[0]!, source, now);
    }
  });
}
