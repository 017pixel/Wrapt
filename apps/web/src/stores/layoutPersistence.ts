import {
  WRAPT_LIMITS,
  layoutStateSchema,
  panelSchema,
  type LayoutState,
  type Panel,
  type WorkbenchGroup,
} from "@wrapt/contracts";
import { z } from "zod";

export const LAYOUT_STORAGE_KEY = "wrapt.layout.v1";
export const LAYOUT_STORAGE_VERSION = 4;
export const LEGACY_LAYOUT_STORAGE_KEYS = [
  "wrapt.workspace.v2",
  "wrapt.workspace.v1",
  "remote-workplace.workspace.v2",
  "remote-workplace.workspace.v1",
  "benjamin-dev-workbench.workspace.v2",
  "benjamin-dev-workbench.workspace.v1",
] as const;

const DEFAULT_PAGE_ID = "page-default";
const DEFAULT_GROUP_ID = "group-default";

export function freshLayout(): LayoutState {
  return {
    version: 4,
    selectedProjectId: null,
    panels: [],
    pages: [
      {
        id: DEFAULT_PAGE_ID,
        name: "Arbeitsfläche 1",
        groups: [{ id: DEFAULT_GROUP_ID, panelIds: [], activePanelId: null }],
        focusedGroupId: DEFAULT_GROUP_ID,
        layout: "single",
        layoutSizes: {},
      },
    ],
    activePageId: DEFAULT_PAGE_ID,
    maximizedPanelId: null,
    focusedPanelId: null,
  };
}

export const emptyLayout: LayoutState = freshLayout();

const legacyLayoutSchema = z.object({
  version: z.literal(1),
  selectedProjectId: z.string().nullable(),
  panels: z.array(panelSchema).max(2),
  layout: z.enum(["horizontal", "vertical"]),
  panelSizes: z.tuple([z.number().min(10).max(90), z.number().min(10).max(90)]),
  maximizedPanelId: z.string().nullable(),
  focusedPanelId: z.string().nullable(),
});

export function migrateLegacyLayout(value: unknown): LayoutState | null {
  const parsed = legacyLayoutSchema.safeParse(value);
  if (!parsed.success) return null;
  const legacy = parsed.data;
  const groups: WorkbenchGroup[] = legacy.panels.length <= 1
    ? [{
        id: DEFAULT_GROUP_ID,
        panelIds: legacy.panels.map((panel) => panel.id),
        activePanelId: legacy.panels[0]?.id ?? null,
      }]
    : legacy.panels.map((panel, index) => ({
        id: `group-migrated-${index + 1}`,
        panelIds: [panel.id],
        activePanelId: panel.id,
      }));
  const focusedPlacement = groups.find((group) => group.panelIds.includes(legacy.focusedPanelId ?? ""));
  const migrated: LayoutState = {
    version: 4,
    selectedProjectId: legacy.selectedProjectId,
    panels: legacy.panels,
    pages: [{
      id: DEFAULT_PAGE_ID,
      name: "Arbeitsfläche 1",
      groups,
      focusedGroupId: focusedPlacement?.id ?? groups[0]!.id,
      layout: legacy.panels.length === 2
        ? (legacy.layout === "vertical" ? "rows" : "columns")
        : "single",
      layoutSizes: legacy.panels.length === 2 ? { root: legacy.panelSizes } : {},
    }],
    activePageId: DEFAULT_PAGE_ID,
    maximizedPanelId: legacy.maximizedPanelId,
    focusedPanelId: legacy.focusedPanelId,
  };
  return layoutStateSchema.safeParse(migrated).success ? migrated : null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function migrateLegacyLayoutFields(value: unknown): unknown {
  const root = recordOf(value);
  if (!root) return value;
  const legacyPages = Array.isArray(root.workspaces) ? root.workspaces : null;
  const pages = Array.isArray(root.pages) ? root.pages : legacyPages;
  if (!pages) return value;
  const rest = { ...root };
  delete rest.workspaces;
  delete rest.activeWorkspaceId;
  return {
    ...rest,
    version: 4,
    pages,
    activePageId: root.activePageId ?? root.activeWorkspaceId,
  };
}

function migrateLegacyHermesPanel(panel: unknown, parsed: Panel): Panel {
  if (parsed.type !== "hermes") return parsed;
  const raw = recordOf(panel);
  const sessionId = typeof raw?.hermesSessionId === "string" ? raw.hermesSessionId : null;
  const surface = typeof raw?.hermesSurface === "string" ? raw.hermesSurface : null;
  if (!sessionId || surface === "admin") return parsed;

  const resumePath = `/chat?resume=${encodeURIComponent(sessionId)}`;
  return resumePath.length <= 512 ? { ...parsed, hermesAdminPath: resumePath } : parsed;
}

/**
 * Arbeitsflächen müssen auch nach einem Rückbau lesbar bleiben. Ein unbekannter
 * Paneltyp darf deshalb nicht die gesamte localStorage-Arbeitsfläche verwerfen.
 * Die Reparatur ist bewusst auf bekannte Panels und ihre Zuordnung begrenzt;
 * strukturell kaputte Dokumente laufen weiterhin durch den normalen Fallback.
 */
function stripUnknownPanels(value: unknown): unknown {
  const root = recordOf(value);
  if (!root || !Array.isArray(root.panels) || !Array.isArray(root.pages)) return value;

  const panels = root.panels.flatMap((panel) => {
    const parsed = panelSchema.safeParse(panel);
    return parsed.success ? [migrateLegacyHermesPanel(panel, parsed.data)] : [];
  });
  // Sind alle Panels unbekannt, bleiben die Arbeitsflächen-Struktur (Gruppen,
  // Layout, Namen) trotzdem erhalten — nur die Panels entfallen (F04-11).

  const panelIds = new Set(panels.map((panel) => panel.id));
  const assigned = new Set<string>();
  const pages = root.pages.map((pageValue) => {
    const page = recordOf(pageValue);
    if (!page || !Array.isArray(page.groups)) return pageValue;
    const groups = page.groups.map((groupValue) => {
      const group = recordOf(groupValue);
      if (!group || !Array.isArray(group.panelIds)) return groupValue;
      const nextPanelIds = group.panelIds.filter((panelId): panelId is string => (
        typeof panelId === "string" && panelIds.has(panelId) && !assigned.has(panelId)
      ));
      nextPanelIds.forEach((panelId) => assigned.add(panelId));
      const activePanelId = typeof group.activePanelId === "string" && nextPanelIds.includes(group.activePanelId)
        ? group.activePanelId
        : (nextPanelIds[0] ?? null);
      return { ...group, panelIds: nextPanelIds, activePanelId };
    });
    const focusedGroupId = typeof page.focusedGroupId === "string"
      && groups.some((group) => recordOf(group)?.id === page.focusedGroupId)
      ? page.focusedGroupId
      : (recordOf(groups[0])?.id ?? page.focusedGroupId);
    return { ...page, groups, focusedGroupId };
  });

  const unassigned = panels.map((panel) => panel.id).filter((panelId) => !assigned.has(panelId));
  if (unassigned.length > 0) {
    const pageIndex = pages.findIndex((pageValue) => {
      const page = recordOf(pageValue);
      return Boolean(page && Array.isArray(page.groups) && page.groups.length > 0);
    });
    if (pageIndex >= 0) {
      const page = recordOf(pages[pageIndex]);
      const groups = page && Array.isArray(page.groups) ? [...page.groups] : [];
      const firstGroup = recordOf(groups[0]);
      if (firstGroup && Array.isArray(firstGroup.panelIds)) {
        groups[0] = {
          ...firstGroup,
          panelIds: [...firstGroup.panelIds, ...unassigned].slice(0, WRAPT_LIMITS.maxResidentTools),
          activePanelId: firstGroup.activePanelId ?? unassigned[0] ?? null,
        };
        pages[pageIndex] = { ...page, groups };
      }
    }
  }

  const pageIds = new Set(pages.flatMap((pageValue) => {
    const page = recordOf(pageValue);
    return typeof page?.id === "string" ? [page.id] : [];
  }));
  const activePageId = typeof root.activePageId === "string" && pageIds.has(root.activePageId)
    ? root.activePageId
    : (pages.map(recordOf).find((page) => typeof page?.id === "string")?.id ?? root.activePageId);

  return {
    ...root,
    version: 4,
    panels,
    pages,
    activePageId,
    maximizedPanelId: typeof root.maximizedPanelId === "string" && panelIds.has(root.maximizedPanelId)
      ? root.maximizedPanelId
      : null,
    focusedPanelId: typeof root.focusedPanelId === "string" && panelIds.has(root.focusedPanelId)
      ? root.focusedPanelId
      : null,
  };
}

export function parseStoredLayoutOrNull(value: unknown): LayoutState | null {
  const renamed = migrateLegacyLayoutFields(value);
  const sanitized = stripUnknownPanels(renamed);
  const parsed = layoutStateSchema.safeParse(sanitized);
  if (parsed.success) return normalizeStoredLayout(parsed.data);
  return migrateLegacyLayout(value);
}

export function parseStoredLayout(value: unknown): LayoutState {
  return parseStoredLayoutOrNull(value) ?? normalizeStoredLayout(freshLayout());
}

function normalizeStoredLayout(layout: LayoutState): LayoutState {
  return {
    ...layout,
    panels: layout.panels.map((panel) => {
      if (panel.type === "t3-code") {
        // Ein Tiefenlink-Ziel aus einem früheren Lauf ist beim Neustart veraltet
        // und gehört nicht in den gespeicherten Zustand zurück.
        return { ...panel, t3Path: undefined };
      }
      if (panel.type !== "hermes" || panel.hermesAdminPath) return panel;
      return { ...panel, hermesAdminPath: "/chat" };
    }),
  };
}

export function visiblePanels(layout: LayoutState, isMobile: boolean): Panel[] {
  if (layout.maximizedPanelId !== null) {
    return layout.panels.filter((panel) => panel.id === layout.maximizedPanelId);
  }
  const page = layout.pages.find((candidate) => candidate.id === layout.activePageId);
  if (!page) return [];
  if (isMobile) {
    const group = page.groups.find((candidate) => candidate.id === page.focusedGroupId) ?? page.groups[0];
    return layout.panels.filter((panel) => panel.id === group?.activePanelId).slice(0, 1);
  }
  const visibleIds = new Set(page.groups.map((group) => group.activePanelId).filter((id): id is string => id !== null));
  return layout.panels.filter((panel) => visibleIds.has(panel.id));
}


function storedStateFromRaw(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw);
    const envelope = recordOf(parsed);
    return envelope && "state" in envelope ? envelope.state : parsed;
  } catch {
    return null;
  }
}

export function migrateLegacyLayoutStorage(storage: Storage): boolean {
  if (storage.getItem(LAYOUT_STORAGE_KEY) !== null) return false;

  for (const legacyKey of LEGACY_LAYOUT_STORAGE_KEYS) {
    const raw = storage.getItem(legacyKey);
    if (raw === null) continue;
    const migrated = parseStoredLayoutOrNull(storedStateFromRaw(raw));
    if (migrated === null) continue;

    const envelope = JSON.stringify({ state: migrated, version: LAYOUT_STORAGE_VERSION });
    storage.setItem(LAYOUT_STORAGE_KEY, envelope);
    const saved = storage.getItem(LAYOUT_STORAGE_KEY);
    if (saved !== null && parseStoredLayoutOrNull(storedStateFromRaw(saved)) !== null) return true;
  }
  return false;
}
