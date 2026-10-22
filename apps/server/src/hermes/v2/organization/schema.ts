/** Nur Identitäten, Revisionen und Zeiten. Keine Antwort-/Requestinhalte speichern. */
export const organizationSchema = `
CREATE TABLE IF NOT EXISTS hermes_v2_sources (
 id TEXT PRIMARY KEY, scope TEXT NOT NULL, session_id TEXT NOT NULL, namespace TEXT NOT NULL,
 source_key TEXT NOT NULL, uid TEXT, row_id INTEGER, epoch TEXT, live_id TEXT, seq INTEGER,
 available INTEGER NOT NULL DEFAULT 1, availability_revision INTEGER NOT NULL DEFAULT 0, UNIQUE(scope,session_id,namespace,source_key)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_session_contexts (
 scope TEXT NOT NULL, session_id TEXT NOT NULL, root_id TEXT NOT NULL,
 PRIMARY KEY(scope,session_id)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_source_sessions (
 source_id TEXT NOT NULL, scope TEXT NOT NULL, session_id TEXT NOT NULL,
 PRIMARY KEY(source_id,scope,session_id)
) STRICT;
CREATE INDEX IF NOT EXISTS hermes_v2_source_session_lookup ON hermes_v2_source_sessions(scope,session_id,source_id);
CREATE TABLE IF NOT EXISTS hermes_v2_attention_facts (
 change_cursor INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 source_id TEXT NOT NULL UNIQUE REFERENCES hermes_v2_sources(id), kind TEXT NOT NULL,
 observed_at INTEGER NOT NULL, completed_at INTEGER
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_source_links (
 from_id TEXT NOT NULL, to_id TEXT NOT NULL, kind TEXT NOT NULL,
 PRIMARY KEY(from_id,to_id,kind)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_row_witnesses (
 scope TEXT NOT NULL, session_id TEXT NOT NULL, row_id INTEGER NOT NULL, uid TEXT NOT NULL,
 PRIMARY KEY(scope,session_id,row_id)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_row_conflicts (
 scope TEXT NOT NULL, row_id INTEGER NOT NULL, PRIMARY KEY(scope,row_id)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_row_conflict_sessions (
 scope TEXT NOT NULL, session_id TEXT NOT NULL, row_id INTEGER NOT NULL,
 PRIMARY KEY(scope,session_id,row_id)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_missing_identities (
 scope TEXT NOT NULL, session_id TEXT NOT NULL, material_key TEXT NOT NULL,
 PRIMARY KEY(scope,session_id,material_key)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_source_availability (
 source_id TEXT NOT NULL, scope TEXT NOT NULL, session_id TEXT NOT NULL, revision INTEGER NOT NULL,
 PRIMARY KEY(source_id,scope,session_id)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_reconciled_sources (
 scope TEXT NOT NULL, session_id TEXT NOT NULL, source_id TEXT NOT NULL,
 PRIMARY KEY(scope,session_id,source_id)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_read_acks (
 owner_id TEXT NOT NULL, source_id TEXT NOT NULL, acknowledged_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,source_id)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_session_metadata (
 owner_id TEXT NOT NULL, scope TEXT NOT NULL, session_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
 pin_rank INTEGER, snoozed_at INTEGER, snoozed_until INTEGER, settled_at INTEGER,
 organization_cursor INTEGER NOT NULL DEFAULT 0, organization_coverage_revision INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL, PRIMARY KEY(owner_id,scope,session_id)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_pin_lists (
 owner_id TEXT NOT NULL, scope TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
 membership_revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id,scope)
) STRICT;
CREATE TABLE IF NOT EXISTS hermes_v2_reconciliation (
 scope TEXT NOT NULL, session_id TEXT NOT NULL, anchor TEXT, known_sources TEXT NOT NULL DEFAULT '[]',
 state TEXT NOT NULL DEFAULT 'baseline', revision INTEGER NOT NULL DEFAULT 0, reason TEXT,
 signature TEXT, PRIMARY KEY(scope,session_id)
) STRICT;
CREATE INDEX IF NOT EXISTS hermes_v2_sources_session ON hermes_v2_sources(scope,session_id);
CREATE INDEX IF NOT EXISTS hermes_v2_physical_row_witness ON hermes_v2_row_witnesses(scope,row_id,uid);
CREATE INDEX IF NOT EXISTS hermes_v2_links_target ON hermes_v2_source_links(to_id,kind,from_id);
CREATE INDEX IF NOT EXISTS hermes_v2_metadata_owner ON hermes_v2_session_metadata(owner_id,scope,pin_rank);
`;
