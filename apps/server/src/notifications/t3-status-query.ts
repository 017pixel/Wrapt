export const threadSelection = `t.thread_id threadId, t.title, t.project_id projectId, p.title projectTitle, t.updated_at updatedAt,
  t.pending_approval_count pendingApprovalCount, t.pending_user_input_count pendingUserInputCount,
  t.has_actionable_proposed_plan hasActionableProposedPlan, t.settled_at settledAt,
  s.status sessionStatus, s.last_error lastError, v.turn_id turnId, v.state turnState,
  v.started_at startedAt, v.completed_at completedAt,
  (SELECT COUNT(*) FROM projection_thread_activities a WHERE a.thread_id=t.thread_id AND a.kind LIKE 'tool.%' AND (a.turn_id=v.turn_id OR v.turn_id IS NULL)) toolCount
  FROM projection_threads t
  LEFT JOIN projection_projects p ON p.project_id = t.project_id
  LEFT JOIN projection_thread_sessions s ON s.thread_id=t.thread_id
  LEFT JOIN projection_turns v ON v.row_id=(SELECT MAX(v2.row_id) FROM projection_turns v2 WHERE v2.thread_id=t.thread_id)
  WHERE t.deleted_at IS NULL`;

