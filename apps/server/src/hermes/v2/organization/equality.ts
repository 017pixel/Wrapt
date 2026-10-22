/** Ausschließlich bewiesene EQUAL-Kanten. Gerichtete COVERS-Kanten sind keine Identität. */
export function equalSourceIds(seed: string): string {
  // seed ist ein interner SQL-Ausdruck oder Platzhalter, niemals Browsereingabe.
  return `WITH RECURSIVE equal_sources(id) AS (
    SELECT ${seed}
    UNION
    SELECT CASE WHEN l.from_id=e.id THEN l.to_id ELSE l.from_id END
    FROM hermes_v2_source_links l JOIN equal_sources e ON l.from_id=e.id OR l.to_id=e.id
    WHERE l.kind='equal'
  ) SELECT id FROM equal_sources`;
}
