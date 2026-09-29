import {
  WRAPT_LIMITS,
  type LayoutPage,
  type LayoutState,
  type Panel,
  type PanelType,
  type WorkbenchGroup,
  type WorkbenchLayout,
} from "@wrapt/contracts";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateId } from "../lib/id";
import {
  freshLayout,
  LAYOUT_STORAGE_KEY,
  LAYOUT_STORAGE_VERSION,
  migrateLegacyLayoutStorage,
  parseStoredLayout,
  visiblePanels,
} from "./layoutPersistence";

export {
  emptyLayout,
  freshLayout,
  LAYOUT_STORAGE_KEY,
  migrateLegacyLayout,
  parseStoredLayout,
  parseStoredLayoutOrNull,
  visiblePanels,
} from "./layoutPersistence";
export type { LayoutPage, LayoutState } from "@wrapt/contracts";

if (typeof window !== "undefined") {
  try {
    migrateLegacyLayoutStorage(window.localStorage);
  } catch {
    // Ein nicht verfügbarer Browser-Speicher darf den Start nicht verhindern.
  }
}

export interface OpenPanelInput {
  type: PanelType;
  projectId?: string | null;
  previewId?: string | null;
  // Tiefenlink für T3-Panels: Pfad hinter dem Proxy-Präfix `/t3`.
  t3Path?: string | null;
  // Zielordner für Code-Server-Panels aus eingebetteten Werkzeugen.
  codeServerFolder?: string | null;
  hermesAdminPath?: string;
  groupId?: string;
  pageId?: string;
}

interface LayoutActions {
  selectProject(projectId: string | null): void;
  openPanel(input: OpenPanelInput): string | null;
  closePanel(panelId: string): void;
  reloadPanel(panelId: string): void;
  setLayout(layout: WorkbenchLayout): void;
  setLayoutSizes(pageId: string, key: string, sizes: [number, number]): void;
  maximizePanel(panelId: string): void;
  restorePanels(): void;
  focusPanel(panelId: string): void;
  focusGroup(groupId: string): void;
  addGroup(): string | null;
  removeGroup(groupId: string): void;
  addPage(name?: string): string | null;
  removePage(pageId: string): void;
  renamePage(pageId: string, name: string): void;
  activatePage(pageId: string): void;
  updateHermesPanel(panelId: string, patch: Partial<Pick<Panel, "hermesAdminPath">>): void;
  setPanelProject(panelId: string, projectId: string | null): void;
  navigateT3Panel(panelId: string, t3Path: string): void;
  resetLayout(): void;
}

export type LayoutStore = LayoutState & LayoutActions;

function makePanel(input: OpenPanelInput): Panel {
  return {
    id: generateId(),
    type: input.type,
    projectId: input.projectId ?? null,
    previewId: input.previewId ?? null,
    reloadKey: 0,
    ...(input.t3Path ? { t3Path: input.t3Path } : {}),
    ...(input.codeServerFolder ? { codeServerFolder: input.codeServerFolder } : {}),
    ...(input.type === "hermes" ? {
      hermesAdminPath: input.hermesAdminPath && input.hermesAdminPath !== "/" ? input.hermesAdminPath : "/chat",
    } : {}),
  };
}

function isSamePanel(panel: Panel, input: OpenPanelInput): boolean {
  if (["terminal", "codex", "opencode", "hermes"].includes(input.type)) return false;
  // Code-Server-Panels aus dem T3-„Open"-Button gehören zum Zielordner:
  // Ein anderer Ordner öffnet einen eigenen Bereich statt den vorhandenen
  // Editor umzustellen.
  const sameFolder = (panel.codeServerFolder ?? null) === (input.codeServerFolder ?? null);
  return (
    sameFolder &&
    panel.type === input.type &&
    panel.projectId === (input.projectId ?? null) &&
    panel.previewId === (input.previewId ?? null)
  );
}

function normalizedLayout(groupCount: number, preferred: WorkbenchLayout): WorkbenchLayout {
  if (groupCount <= 1) return "single";
  if (groupCount === 2) return preferred === "rows" ? "rows" : "columns";
  if (groupCount === 3) return "main-left";
  return "grid";
}

function placementOf(pages: LayoutPage[], panelId: string) {
  for (const page of pages) {
    const group = page.groups.find((candidate) => candidate.panelIds.includes(panelId));
    if (group) return { page, group };
  }
  return null;
}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set, get) => ({
      ...freshLayout(),
      selectProject: (selectedProjectId) => set({ selectedProjectId }),
      openPanel: (input) => {
        const current = get();
        const existing = current.panels.find((panel) => isSamePanel(panel, input));
        if (existing) {
          get().focusPanel(existing.id);
          const hasT3Path = input.type === "t3-code" && input.t3Path !== undefined;
          set({
            selectedProjectId: input.projectId ?? current.selectedProjectId,
            maximizedPanelId: null,
            ...(hasT3Path ? {
              panels: current.panels.map((panel) => panel.id !== existing.id
                ? panel
                : {
                    ...panel,
                    ...(hasT3Path ? { t3Path: input.t3Path ?? undefined } : {}),
                    reloadKey: panel.reloadKey + 1,
                  }),
            } : {}),
          });
          return existing.id;
        }
        if (current.panels.length >= WRAPT_LIMITS.maxResidentTools) return null;

        const requestedPage = input.pageId
          ? current.pages.find((page) => page.id === input.pageId)
          : undefined;
        const requestedGroupPlacement = input.groupId
          ? current.pages.flatMap((page) => page.groups.map((group) => ({ page, group })))
              .find(({ group }) => group.id === input.groupId)
          : undefined;
        const targetPage = requestedGroupPlacement?.page
          ?? requestedPage
          ?? current.pages.find((page) => page.id === current.activePageId)
          ?? current.pages[0]!;
        const targetGroup = requestedGroupPlacement?.group
          ?? targetPage.groups.find((group) => group.id === targetPage.focusedGroupId)
          ?? targetPage.groups[0]!;
        const panel = makePanel(input);
        set({
          panels: [...current.panels, panel],
          selectedProjectId: input.projectId ?? current.selectedProjectId,
          activePageId: targetPage.id,
          focusedPanelId: panel.id,
          maximizedPanelId: null,
          pages: current.pages.map((page) => page.id !== targetPage.id
            ? page
            : {
                ...page,
                focusedGroupId: targetGroup.id,
                groups: page.groups.map((group) => group.id !== targetGroup.id
                  ? group
                  : { ...group, panelIds: [...group.panelIds, panel.id], activePanelId: panel.id }),
              }),
        });
        return panel.id;
      },
      closePanel: (panelId) => set((current) => {
        const panels = current.panels.filter((panel) => panel.id !== panelId);
        const pages = current.pages.map((page) => ({
          ...page,
          groups: page.groups.map((group) => {
            if (!group.panelIds.includes(panelId)) return group;
            const panelIds = group.panelIds.filter((id) => id !== panelId);
            return {
              ...group,
              panelIds,
              activePanelId: group.activePanelId === panelId ? (panelIds.at(-1) ?? null) : group.activePanelId,
            };
          }),
        }));
        const focusedPanelId = current.focusedPanelId === panelId
          ? (visiblePanels({ ...current, panels, pages, focusedPanelId: null, maximizedPanelId: null }, false).at(-1)?.id ?? null)
          : current.focusedPanelId;
        return {
          panels,
          pages,
          maximizedPanelId: current.maximizedPanelId === panelId ? null : current.maximizedPanelId,
          focusedPanelId,
        };
      }),
      reloadPanel: (panelId) => set((current) => ({
        panels: current.panels.map((panel) => panel.id === panelId
          ? { ...panel, reloadKey: panel.reloadKey + 1 }
          : panel),
      })),
      setLayout: (layout) => set((current) => ({
        pages: current.pages.map((page) => page.id === current.activePageId
          ? { ...page, layout: normalizedLayout(page.groups.length, layout) }
          : page),
      })),
      setLayoutSizes: (pageId, key, sizes) => {
        if (Math.abs(sizes[0] + sizes[1] - 100) > 0.5) return;
        set((current) => ({
          pages: current.pages.map((page) => page.id === pageId
            ? { ...page, layoutSizes: { ...page.layoutSizes, [key]: sizes } }
            : page),
        }));
      },
      maximizePanel: (panelId) => {
        if (get().panels.some((panel) => panel.id === panelId)) {
          get().focusPanel(panelId);
          set({ maximizedPanelId: panelId });
        }
      },
      restorePanels: () => set({ maximizedPanelId: null }),
      focusPanel: (panelId) => set((current) => {
        const placement = placementOf(current.pages, panelId);
        if (!placement) return current;
        return {
          activePageId: placement.page.id,
          focusedPanelId: panelId,
          pages: current.pages.map((page) => page.id !== placement.page.id
            ? page
            : {
                ...page,
                focusedGroupId: placement.group.id,
                groups: page.groups.map((group) => group.id === placement.group.id
                  ? { ...group, activePanelId: panelId }
                  : group),
              }),
        };
      }),
      focusGroup: (groupId) => set((current) => ({
        pages: current.pages.map((page) => page.id === current.activePageId && page.groups.some((group) => group.id === groupId)
          ? { ...page, focusedGroupId: groupId }
          : page),
      })),
      addGroup: () => {
        const current = get();
        const page = current.pages.find((candidate) => candidate.id === current.activePageId);
        if (!page || page.groups.length >= WRAPT_LIMITS.maxVisibleGroups) return null;
        const group: WorkbenchGroup = { id: generateId(), panelIds: [], activePanelId: null };
        set({
          pages: current.pages.map((candidate) => candidate.id !== page.id
            ? candidate
            : {
                ...candidate,
                groups: [...candidate.groups, group],
                focusedGroupId: group.id,
                layout: normalizedLayout(candidate.groups.length + 1, candidate.layout),
              }),
        });
        return group.id;
      },
      removeGroup: (groupId) => set((current) => ({
        pages: current.pages.map((page) => {
          if (page.id !== current.activePageId || page.groups.length <= 1) return page;
          const removed = page.groups.find((group) => group.id === groupId);
          if (!removed) return page;
          const groups = page.groups.filter((group) => group.id !== groupId);
          const target = groups[0]!;
          const mergedGroups = groups.map((group) => group.id !== target.id ? group : {
            ...group,
            panelIds: [...group.panelIds, ...removed.panelIds],
            activePanelId: removed.activePanelId ?? group.activePanelId,
          });
          return {
            ...page,
            groups: mergedGroups,
            focusedGroupId: page.focusedGroupId === groupId ? target.id : page.focusedGroupId,
            layout: normalizedLayout(mergedGroups.length, page.layout),
          };
        }),
      })),
      addPage: (name) => {
        const current = get();
        if (current.pages.length >= WRAPT_LIMITS.maxLayoutPages) return null;
        const id = generateId();
        const groupId = generateId();
        const page: LayoutPage = {
          id,
          name: name?.trim().slice(0, 48) || `Arbeitsfläche ${current.pages.length + 1}`,
          groups: [{ id: groupId, panelIds: [], activePanelId: null }],
          focusedGroupId: groupId,
          layout: "single",
          layoutSizes: {},
        };
        set({ pages: [...current.pages, page], activePageId: id, focusedPanelId: null, maximizedPanelId: null });
        return id;
      },
      removePage: (pageId) => set((current) => {
        if (current.pages.length <= 1) return current;
        const removed = current.pages.find((page) => page.id === pageId);
        if (!removed) return current;
        const removedPanelIds = new Set(removed.groups.flatMap((group) => group.panelIds));
        const pages = current.pages.filter((page) => page.id !== pageId);
        const activePageId = current.activePageId === pageId ? pages[0]!.id : current.activePageId;
        return {
          panels: current.panels.filter((panel) => !removedPanelIds.has(panel.id)),
          pages,
          activePageId,
          focusedPanelId: removedPanelIds.has(current.focusedPanelId ?? "") ? null : current.focusedPanelId,
          maximizedPanelId: removedPanelIds.has(current.maximizedPanelId ?? "") ? null : current.maximizedPanelId,
        };
      }),
      renamePage: (pageId, name) => {
        const nextName = name.trim().slice(0, 48);
        if (!nextName) return;
        set((current) => ({
          pages: current.pages.map((page) => page.id === pageId ? { ...page, name: nextName } : page),
        }));
      },
      activatePage: (pageId) => set((current) => current.pages.some((page) => page.id === pageId)
        ? { activePageId: pageId, focusedPanelId: null, maximizedPanelId: null }
        : current),
      updateHermesPanel: (panelId, patch) => set((current) => ({
        panels: current.panels.map((panel) => panel.id === panelId && panel.type === "hermes" ? { ...panel, ...patch } : panel),
      })),
      setPanelProject: (panelId, projectId) => set((current) => ({
        panels: current.panels.map((panel) => panel.id === panelId && panel.type === "hermes" ? { ...panel, projectId } : panel),
      })),
      navigateT3Panel: (panelId, t3Path) => set((current) => ({
        panels: current.panels.map((panel) => panel.id === panelId && panel.type === "t3-code"
          ? { ...panel, t3Path, reloadKey: panel.reloadKey + 1 }
          : panel),
      })),
      resetLayout: () => set(freshLayout()),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      version: LAYOUT_STORAGE_VERSION,
      partialize: ({
        version,
        selectedProjectId,
        panels,
        pages,
        activePageId,
        maximizedPanelId,
        focusedPanelId,
      }) => ({ version, selectedProjectId, panels, pages, activePageId, maximizedPanelId, focusedPanelId }),
      merge: (persisted, current) => ({ ...current, ...parseStoredLayout(persisted) }),
      // Alte Daten werden in die Layout-Felder und Version 4 überführt.
      migrate: (persisted) => parseStoredLayout(persisted),
    },
  ),
);
