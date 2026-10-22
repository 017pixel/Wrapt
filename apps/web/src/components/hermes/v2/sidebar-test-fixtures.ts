import { vi } from "vitest";
import { projectChoices } from "./sidebar-view";
import type {
  HermesV2Sidebar,
  ReadGeneration,
  SidebarDropPlan,
  SidebarGroupView,
  SidebarOrganization,
  SidebarRowView,
  SnoozeInput,
  SnoozeResolution,
} from "./sidebar-types";

/** Testwerkzeuge nur für UI-Tests: Viewmodel-Fixtures ohne echte Runtime. */
export function makeMetadata(
  overrides: Partial<SidebarOrganization> = {},
): SidebarOrganization {
  return {
    sessionId: "s1",
    revision: 3,
    pinRevision: 1,
    pinRank: null,
    snoozedAt: null,
    snoozedUntil: null,
    settledAt: null,
    effectiveSnoozedUntil: null,
    effectiveSettledAt: null,
    organizationCursor: 10,
    organizationCoverageRevision: 1,
    attention: { unreadCount: 0, requiresAttention: false, latest: null },
    coverage: { state: "anchored", revision: 1, reason: null },
    serverNow: 1_000_000,
    ...overrides,
  };
}

export function makeRow(
  overrides: Partial<SidebarRowView> & { id?: string } = {},
): SidebarRowView {
  return {
    id: "s1",
    title: "Erste Sitzung",
    cwd: "/projekt/eins",
    projectId: "p1",
    model: "m",
    provider: "prov",
    group: "active",
    pinned: false,
    activity: "idle",
    turnStartedAt: null,
    durationMs: null,
    requestCount: null,
    subagentCount: null,
    backgroundCount: null,
    unreadCount: 0,
    attentionKind: null,
    attentionAt: null,
    attentionTimeIsObserved: true,
    updatedAt: 900_000,
    snoozedUntil: null,
    settledAt: null,
    missingSummary: false,
    ...overrides,
    metadata:
      overrides.metadata ?? makeMetadata({ sessionId: overrides.id ?? "s1" }),
  } as SidebarRowView;
}

export function makeGroup(
  id: SidebarGroupView["id"],
  rows: SidebarRowView[],
  overrides: Partial<SidebarGroupView> = {},
): SidebarGroupView {
  return {
    id,
    rows,
    count: rows.length,
    collapsed: false,
    loading: false,
    hasMore: false,
    complete: true,
    ...overrides,
  };
}

export const testGeneration = {} as ReadGeneration;

export interface SidebarFixture extends HermesV2Sidebar {
  calls: {
    organize: NonNullable<Parameters<HermesV2Sidebar["organize"]>[0]>[];
    snooze: Array<[string, number, SnoozeInput]>;
    executeDrop: SidebarDropPlan[];
    undo: number;
    loadMembers: string[];
  };
}

/** Vollständiges Viewmodel-Fixture mit aufgezeichneten Aktionen. */
export function makeSidebar(
  overrides: {
    groups?: SidebarGroupView[];
    search?: Partial<HermesV2Sidebar["search"]>;
    collapsed?: Partial<HermesV2Sidebar["collapsed"]>;
    busySessionIds?: string[];
    error?: HermesV2Sidebar["error"];
    undoView?: HermesV2Sidebar["undoView"];
    pinMembershipComplete?: boolean;
    previewSnooze?: (input: SnoozeInput) => SnoozeResolution;
    readView?: HermesV2Sidebar["readView"];
  } = {},
): SidebarFixture {
  const calls = {
    organize: [],
    snooze: [],
    executeDrop: [],
    undo: 0,
    loadMembers: [],
  } as SidebarFixture["calls"];
  const rows = (overrides.groups ?? []).flatMap((group) => group.rows);
  const sidebar: HermesV2Sidebar = {
    groups: overrides.groups ?? [makeGroup("active", [makeRow()])],
    rows,
    projects: projectChoices(rows),
    activeSessionId: null,
    search: {
      query: "",
      loading: false,
      hasMore: false,
      nextOffset: null,
      loadedCount: 0,
      partial: false,
      limitReached: false,
      ...overrides.search,
    },
    collapsed: {
      working: false,
      snoozed: false,
      settled: false,
      ...overrides.collapsed,
    },
    loading: false,
    busySessionIds: overrides.busySessionIds ?? [],
    error: overrides.error ?? null,
    undoView: overrides.undoView ?? null,
    pinMembershipComplete: overrides.pinMembershipComplete ?? true,
    readView: overrides.readView ?? {
      generation: null,
      sessionId: null,
      notices: [],
      loading: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      onVisibleEvidence: vi.fn().mockResolvedValue(undefined),
    },
    setQuery: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    loadMore: vi.fn().mockResolvedValue(undefined),
    loadMembers: vi.fn((shelf: "pinned" | "snoozed" | "settled") => {
      calls.loadMembers.push(shelf);
      return Promise.resolve();
    }),
    setCollapsed: vi.fn(),
    organize: vi.fn((intent: Parameters<HermesV2Sidebar["organize"]>[0]) => {
      calls.organize.push(intent);
      return Promise.resolve();
    }),
    snooze: vi.fn(
      (sessionId: string, expectedRevision: number, input: SnoozeInput) => {
        calls.snooze.push([sessionId, expectedRevision, input]);
        return Promise.resolve();
      },
    ),
    previewSnooze:
      overrides.previewSnooze ??
      ((input: SnoozeInput) =>
        input.preset === "custom"
          ? {
              ok: true as const,
              until: 1_800_000_000_000,
              timeZone: input.timeZone,
            }
          : {
              ok: true as const,
              until: 1_700_000_000_000,
              timeZone: input.timeZone,
            }),
    preparePinnedReorder: vi.fn().mockResolvedValue(undefined),
    planDrop: vi.fn((sessionId: string, target: string): SidebarDropPlan => ({
      allowed: true as const,
      kind: "action" as const,
      command: {
        sessionId,
        expectedRevision: 3,
        action:
          target === "pinned"
            ? ("pin" as const)
            : target === "settled"
              ? ("settle" as const)
              : ("unpin" as const),
      },
    })),
    executeDrop: vi.fn((plan: SidebarDropPlan) => {
      calls.executeDrop.push(plan);
      return Promise.resolve();
    }),
    reorderPinned: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn(() => {
      calls.undo += 1;
      return Promise.resolve();
    }),
    clearError: vi.fn(),
  };
  return { ...sidebar, calls } as SidebarFixture;
}
