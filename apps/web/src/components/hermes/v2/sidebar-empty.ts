import type { HermesV2Sidebar } from "./sidebar-types";

const done = () => Promise.resolve();
export const emptySidebar: HermesV2Sidebar = {
  groups: [], rows: [], projects: [], activeSessionId: null,
  search: { query: "", loading: false, hasMore: false, nextOffset: null, loadedCount: 0, partial: true, limitReached: false },
  collapsed: { working: false, snoozed: true, settled: true }, loading: false, busySessionIds: [], error: null, undoView: null, pinMembershipComplete: false,
  readView: { generation: null, sessionId: null, notices: [], loading: false, hasMore: false, error: null, loadMore: done, refresh: done, onVisibleEvidence: done },
  setQuery: () => {}, refresh: done, loadMore: done, loadMembers: done, setCollapsed: () => {}, organize: done,
  snooze: done, previewSnooze: () => ({ ok: false, code: "INVALID_TIME", message: "Die Hermes-Fläche ist nicht aktiv.", alternatives: [] }),
  preparePinnedReorder: done, planDrop: () => ({ allowed: false, reason: "Die Hermes-Fläche ist nicht aktiv." }), executeDrop: done, reorderPinned: done, undo: done, clearError: () => {},
};
