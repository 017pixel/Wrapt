/**
 * Remote-Leser für die T3-Projektion. Läuft über python3, weil die
 * sqlite3-CLI auf den Zielrechnern oft fehlt; gelesen wird ausschließlich
 * read-only mit busy_timeout.
 */
export const REMOTE_READER_SCRIPT = `
import json, sqlite3, sys

db_path, env_path = sys.argv[1], sys.argv[2]
last_seq = int(sys.argv[3])
initialized = sys.argv[4] == "1"
out = {"environmentId": "", "currentSequence": 0, "touched": [], "rows": [], "activities": {}}
try:
    with open(env_path, encoding="utf-8") as f:
        raw = f.read().strip()
    out["environmentId"] = json.loads(raw).get("id", raw) if raw.startswith("{") else raw
except Exception:
    pass
try:
    db = sqlite3.connect("file:" + db_path + "?mode=ro", uri=True)
    db.execute("PRAGMA busy_timeout=1500")
    cols = {r[1] for r in db.execute("PRAGMA table_info(projection_threads)")}
    required = {"thread_id", "title", "project_id", "pending_approval_count", "pending_user_input_count", "has_actionable_proposed_plan"}
    if required <= cols:
        current = db.execute("SELECT COALESCE(MAX(sequence),0) FROM orchestration_events").fetchone()[0]
        out["currentSequence"] = current
        touched = [r[0] for r in db.execute("SELECT DISTINCT stream_id FROM orchestration_events WHERE sequence > ? AND aggregate_kind = 'thread'", (last_seq,))] if initialized else []
        out["touched"] = touched
        if initialized and not touched:
            filter_sql = "AND 0"
            params = []
        elif initialized:
            filter_sql = "AND t.thread_id IN (" + ",".join("?" * len(touched)) + ")"
            params = touched
        else:
            filter_sql = ""
            params = []
        rows = db.execute("""
            SELECT t.thread_id, t.title, t.project_id, p.title, t.updated_at,
              t.pending_approval_count, t.pending_user_input_count, t.has_actionable_proposed_plan,
              t.settled_at, s.status, s.last_error, v.turn_id, v.state, v.started_at, v.completed_at,
              (SELECT COUNT(*) FROM projection_thread_activities a WHERE a.thread_id=t.thread_id AND a.kind LIKE 'tool.%' AND (a.turn_id=v.turn_id OR v.turn_id IS NULL))
            FROM projection_threads t
            LEFT JOIN projection_projects p ON p.project_id = t.project_id
            LEFT JOIN projection_thread_sessions s ON s.thread_id=t.thread_id
            LEFT JOIN projection_turns v ON v.row_id=(SELECT MAX(v2.row_id) FROM projection_turns v2 WHERE v2.thread_id=t.thread_id)
            WHERE t.deleted_at IS NULL """ + filter_sql, params).fetchall()
        keys = ["threadId", "title", "projectId", "projectTitle", "updatedAt", "pendingApprovalCount", "pendingUserInputCount", "hasActionableProposedPlan", "settledAt", "sessionStatus", "lastError", "turnId", "turnState", "startedAt", "completedAt", "toolCount"]
        out["rows"] = [dict(zip(keys, r)) for r in rows]
        for tid in [r[0] for r in rows]:
            acts = db.execute("SELECT summary FROM projection_thread_activities WHERE thread_id=? ORDER BY created_at DESC LIMIT 20", (tid,)).fetchall()
            out["activities"][tid] = [a[0] for a in reversed(acts)]
    db.close()
except Exception:
    pass
print(json.dumps(out))
`;
