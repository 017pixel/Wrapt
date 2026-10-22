import type { ChatRuntime } from "./chat-runtime";
import type { OwnerRecord } from "./chat-owners";

/** Frische native Freigabe umgeht keine inzwischen konkret beobachtete lokale Arbeit. */
export function resourceSessionProtected(chat: ChatRuntime, id: string, owners?: ReadonlyMap<OwnerRecord, number>): boolean {
  const state = chat.store.peek(id);
  const terminal = new Set(["completed", "complete", "failed", "interrupted", "cancelled", "killed", "exited", "already_exited", "not_found", "error"]);
  if (state && (state.loading || state.running !== false || state.requests.length || state.queuedText !== null
    || [...state.work.tasks, ...state.work.subagents, ...state.work.processes].some((row) => row.status === null || !terminal.has(row.status)))) return true;
  return [...chat.owners.records.values()].some((owner) => {
    const draft = owner.drafts.get(id);
    return !!draft?.submitting || !!draft?.unknown || !!(owners && owner.sessionId === id && owners.get(owner) !== owner.generation);
  });
}
