import type { ChatErrorInfo } from "./chat-types";

/** "active" ist die namenlose Hauptliste der zuletzt benutzten Chats. */
export type SidebarShelf = "pinned" | "needs-input" | "active" | "working" | "snoozed" | "settled";
export type MemberShelf = "pinned" | "snoozed" | "settled";
export type CollapsibleShelf = "working" | "snoozed" | "settled";
export type SidebarActivity = "waiting_input" | "working" | "idle" | "unknown";
export type AttentionKind = "live-turn-end" | "new-answer" | "decision-error";
export interface SidebarOrganization {
  sessionId: string;
  revision: number;
  pinRevision: number;
  pinRank: number | null;
  snoozedAt: number | null;
  snoozedUntil: number | null;
  settledAt: number | null;
  effectiveSnoozedUntil: number | null;
  effectiveSettledAt: number | null;
  organizationCursor: number;
  organizationCoverageRevision: number;
  attention: { unreadCount: number; requiresAttention: boolean; latest: {
    id: string; kind: AttentionKind; unread: boolean; relevant: boolean;
    observedAt: number; completedAt: number | null;
  } | null };
  coverage: { state: "baseline" | "anchored" | "gap" | "identity-unknown"; revision: number; reason: string | null };
  serverNow: number;
}
export interface SidebarRowView {
  id: string;
  title: string;
  cwd: string | null;
  projectId: string | null;
  model: string | null;
  provider: string | null;
  group: SidebarShelf;
  pinned: boolean;
  activity: SidebarActivity;
  turnStartedAt: number | null;
  durationMs: number | null;
  requestCount: number | null;
  subagentCount: number | null;
  backgroundCount: number | null;
  unreadCount: number;
  attentionKind: AttentionKind | "request" | "coverage" | null;
  attentionAt: number | null;
  attentionTimeIsObserved: boolean;
  updatedAt: number | null;
  snoozedUntil: number | null;
  settledAt: number | null;
  metadata: SidebarOrganization;
  missingSummary: boolean;
}
export interface SidebarGroupView {
  id: SidebarShelf;
  rows: readonly SidebarRowView[];
  /** Anzahl der tatsächlich geladenen Zeilen, keine erfundene globale Summe. */
  count: number;
  collapsed: boolean;
  loading: boolean;
  hasMore: boolean;
  complete: boolean;
}
export interface SidebarSearchView {
  query: string;
  loading: boolean;
  hasMore: boolean;
  nextOffset: number | null;
  loadedCount: number;
  partial: boolean;
  limitReached: boolean;
}
export type OrganizationAction = "pin" | "unpin" | "snooze" | "wake" | "settle" | "unsettle";
/** UI behält die Revision der tatsächlich angebotenen Aktion, kein stilles CAS-Upgrade. */
export type SidebarActionIntent = {
  sessionId: string;
  expectedRevision: number;
} & ({ action: Exclude<OrganizationAction, "snooze"> } | { action: "snooze"; snoozedUntil: number });
export type SidebarDropTarget = "pinned" | "active" | "settled";
export interface SidebarReorderIntent {
  expectedPinRevision: number;
  entries: readonly { sessionId: string; expectedRevision: number }[];
}
export type SidebarDropPlan = { allowed: false; reason: string }
  | { allowed: true; kind: "action"; command: SidebarActionIntent }
  | { allowed: true; kind: "reorder"; command: SidebarReorderIntent };
export type SnoozeInput = { timeZone: string } & (
  { preset: "30m" | "1h" | "evening" | "tomorrow" }
  | { preset: "custom"; date: string; time: string; offsetMinutes?: number }
);
export type SnoozeResolution = { ok: true; until: number; timeZone: string }
  | { ok: false; code: "INVALID_TIME" | "NONEXISTENT_TIME" | "AMBIGUOUS_TIME" | "OUT_OF_RANGE";
    message: string; alternatives: readonly { until: number; offsetMinutes: number }[] };
export interface SidebarUndoView {
  handle: string;
  expiresAt: number;
  remainingMs: number;
}
declare const readGenerationBrand: unique symbol;
/** Nur vom Runtime ausgestellt. UI reicht diese Referenz unverändert zurück. */
export type ReadGeneration = { readonly [readGenerationBrand]: true };
export interface SidebarNoticeView {
  id: string;
  kind: "decision-error" | "historical-decision-error" | "unavailable-content";
  text: string;
  observedAt: number;
  completedAt: number | null;
  readEvidence: string | null;
}
export interface HermesV2ReadView {
  generation: ReadGeneration | null;
  sessionId: string | null;
  notices: readonly SidebarNoticeView[];
  loading: boolean;
  hasMore: boolean;
  error: ChatErrorInfo | null;
  loadMore(): Promise<void>;
  refresh(): Promise<void>;
  /** Ausschließlich nach sichtbarer, vollständiger Darstellung von Message-/Notice-Rows. */
  onVisibleEvidence(generation: ReadGeneration, handles: readonly string[]): Promise<void>;
}
export interface SidebarProjectChoice {
  id: string;
  label: string;
}

export interface HermesV2SidebarOptions {
  ownerId: string;
  /** Optionaler Konsistenzhinweis; ACK prüft immer den tatsächlichen Chatowner. */
  sessionId?: string | null;
  active?: boolean;
  visible?: boolean;
  projectId?: string | null;
}
export interface HermesV2SidebarActions {
  setQuery(query: string): void;
  refresh(): Promise<void>;
  loadMore(): Promise<void>;
  loadMembers(shelf: MemberShelf): Promise<void>;
  setCollapsed(shelf: CollapsibleShelf, collapsed: boolean): void;
  organize(intent: SidebarActionIntent): Promise<void>;
  snooze(sessionId: string, expectedRevision: number, input: SnoozeInput): Promise<void>;
  previewSnooze(input: SnoozeInput): SnoozeResolution;
  preparePinnedReorder(): Promise<void>;
  planDrop(sessionId: string, target: SidebarDropTarget, beforeSessionId?: string): SidebarDropPlan;
  executeDrop(plan: SidebarDropPlan): Promise<void>;
  reorderPinned(intent: SidebarReorderIntent): Promise<void>;
  undo(): Promise<void>;
  clearError(): void;
}
export interface HermesV2Sidebar extends HermesV2SidebarActions {
  groups: readonly SidebarGroupView[];
  rows: readonly SidebarRowView[];
  /** Projektzuordnungen aller geladenen Zeilen, auch wenn ein Filter steht. */
  projects: readonly SidebarProjectChoice[];
  activeSessionId: string | null;
  search: SidebarSearchView;
  collapsed: Readonly<Record<CollapsibleShelf, boolean>>;
  loading: boolean;
  busySessionIds: readonly string[];
  error: ChatErrorInfo | null;
  undoView: SidebarUndoView | null;
  pinMembershipComplete: boolean;
  readView: HermesV2ReadView;
}
/** Alle Promise<void>-UI-Aktionen zeigen Fehler im Viewmodel und resolven. */
export type UseHermesV2Sidebar = (options: HermesV2SidebarOptions) => HermesV2Sidebar;
