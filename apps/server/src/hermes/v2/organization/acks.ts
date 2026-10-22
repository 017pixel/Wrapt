import type { HermesV2ReadAck, HermesV2ReadResult } from "@wrapt/contracts/hermes-v2";
import type { OrganizationRepository } from "./repository.js";
import type { EvidenceRegistry } from "./evidence.js";
import { OrganizationError } from "./errors.js";
import { equalSourceIds } from "./equality.js";

export function acknowledge(repo: OrganizationRepository, evidence: EvidenceRegistry, owner: string, scope: string, input: HermesV2ReadAck, now: number): HermesV2ReadResult {
  // Erst den gesamten Batch prüfen. Kein teilweise akzeptierter Read bei abgelaufenem Handle.
  const sources = [...new Set(input.evidence.flatMap((handle) => evidence.get(handle, owner, scope, input.sessionId)))];
  return repo.transaction(() => {
    let changed = false;
    const affected = new Set<string>();
    let pendingSources = 0;
    const facts = new Set<string>();
    for (const id of sources) {
      const source = repo.one<{ scope: string; session_id: string }>("SELECT scope,session_id FROM hermes_v2_source_sessions WHERE source_id=? AND scope=? AND session_id=?", id, scope, input.sessionId);
      if (!source || source.scope !== scope || source.session_id !== input.sessionId) throw new OrganizationError(400, "READ_EVIDENCE_INVALID", "Die Belegquelle ist nicht mehr verfügbar.");
      if (!repo.one("SELECT 1 FROM hermes_v2_read_acks WHERE owner_id=? AND source_id=?", owner, id)) {
        repo.run("INSERT INTO hermes_v2_read_acks VALUES(?,?,?)", owner, id, now);
        changed = true;
        for (const session of repo.sourceSessions(id)) if (session.scope === scope) affected.add(session.session_id);
      }
      const fact = repo.one<{ id: string }>(`SELECT id FROM hermes_v2_attention_facts WHERE source_id IN (${equalSourceIds("?")}) ORDER BY change_cursor LIMIT 1`, id);
      if (fact) facts.add(fact.id);
      else pendingSources++;
    }
    if (changed) for (const session of affected) repo.touch(owner, scope, session, now);
    return { revision: repo.metadata(owner, scope, input.sessionId, now).revision,
      acknowledgedSources: sources.length, pendingSources, readFactIds: [...facts].slice(0, 4096), serverNow: now };
  });
}
