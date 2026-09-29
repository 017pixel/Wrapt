import { WRAPT_LIMITS, type LayoutState } from "@wrapt/contracts";
// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { emptyLayout, migrateLegacyLayout, parseStoredLayout, useLayoutStore, visiblePanels } from "./layout";
import { LAYOUT_STORAGE_KEY, LEGACY_LAYOUT_STORAGE_KEYS, migrateLegacyLayoutStorage } from "./layoutPersistence";

const twoPanelLayout: LayoutState = {
  version: 4,
  selectedProjectId: "chappie",
  panels: [
    { id: "left", type: "t3-code", projectId: "chappie", previewId: null, reloadKey: 0 },
    { id: "right", type: "code-server", projectId: "chappie", previewId: null, reloadKey: 0 },
  ],
  pages: [{
    id: "page-1",
    name: "Entwicklung",
    groups: [
      { id: "left-group", panelIds: ["left"], activePanelId: "left" },
      { id: "right-group", panelIds: ["right"], activePanelId: "right" },
    ],
    focusedGroupId: "right-group",
    layout: "columns",
    layoutSizes: { root: [50, 50] },
  }],
  activePageId: "page-1",
  maximizedPanelId: null,
  focusedPanelId: "right",
};

describe("layout persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useLayoutStore.getState().resetLayout();
  });

  it("falls back to an empty layout when persisted data is invalid", () => {
    expect(parseStoredLayout({ version: 2, panels: [{ id: "broken" }] })).toEqual(emptyLayout);
  });

  it("behält bekannte Panels, wenn ein zurückgebauter Typ in localStorage liegt", () => {
    const parsed = parseStoredLayout({
      ...twoPanelLayout,
      panels: [
        ...twoPanelLayout.panels,
        { id: "retired-hermes", type: "hermes-agent", projectId: null, previewId: null, reloadKey: 0 },
      ],
      pages: [{
        ...twoPanelLayout.pages[0]!,
        groups: [
          { ...twoPanelLayout.pages[0]!.groups[0]!, panelIds: ["left", "retired-hermes"] },
          twoPanelLayout.pages[0]!.groups[1]!,
        ],
      }],
    });

    expect(parsed.panels.map((panel) => panel.id)).toEqual(["left", "right"]);
    expect(parsed.pages[0]?.groups[0]?.panelIds).toEqual(["left"]);
  });

  it("überführt eine alte Hermes-Sitzung in den offiziellen SPA-Pfad", () => {
    const parsed = parseStoredLayout({
      ...twoPanelLayout,
      panels: [
        ...twoPanelLayout.panels,
        {
          id: "legacy-hermes",
          type: "hermes",
          projectId: null,
          previewId: null,
          reloadKey: 0,
          hermesSurface: "chat",
          hermesSessionId: "session-from-storage",
        },
      ],
      pages: [{
        ...twoPanelLayout.pages[0]!,
        groups: [{
          ...twoPanelLayout.pages[0]!.groups[0]!,
          panelIds: ["left", "legacy-hermes"],
          activePanelId: "legacy-hermes",
        }, twoPanelLayout.pages[0]!.groups[1]!],
      }],
    });

    expect(parsed.panels.find((panel) => panel.id === "legacy-hermes")).toMatchObject({
      type: "hermes",
      hermesAdminPath: "/chat?resume=session-from-storage",
    });
  });

  it("migrates the former two-panel layout without discarding tools", () => {
    const migrated = migrateLegacyLayout({
      version: 1,
      selectedProjectId: "chappie",
      panels: twoPanelLayout.panels,
      layout: "horizontal",
      panelSizes: [60, 40],
      maximizedPanelId: null,
      focusedPanelId: "right",
    });

    expect(migrated?.version).toBe(4);
    expect(migrated?.panels).toHaveLength(2);
    expect(migrated?.pages[0]?.groups).toHaveLength(2);
    expect(migrated?.pages[0]?.layoutSizes.root).toEqual([60, 40]);
  });

  it("wandelt einen gespeicherten Workspace-Stand ohne Datenverlust ins Layout-Schema um", () => {
    const parsed = parseStoredLayout({
      ...twoPanelLayout,
      version: 2,
      workspaces: twoPanelLayout.pages,
      activeWorkspaceId: twoPanelLayout.activePageId,
      pages: undefined,
      activePageId: undefined,
    });

    expect(parsed.version).toBe(4);
    expect(parsed.panels).toHaveLength(2);
    expect(parsed.pages[0]?.groups[0]?.panelIds).toEqual(["left"]);
    expect(parsed.selectedProjectId).toBe("chappie");
  });

  it("migriert den alten Storage-Key vollständig ins versionierte Layout-Schema", () => {
    window.localStorage.clear();
    const panels = Array.from({ length: 10 }, (_, index) => ({
      id: `panel-${index}`,
      type: "terminal" as const,
      projectId: null,
      previewId: null,
      reloadKey: index,
    }));
    const pages = Array.from({ length: 8 }, (_, pageIndex) => {
      const pagePanels = panels.filter((_, panelIndex) => panelIndex % 8 === pageIndex);
      const groupId = `group-${pageIndex}`;
      return {
        id: `page-${pageIndex}`,
        name: `Fläche ${pageIndex + 1}`,
        groups: [{
          id: groupId,
          panelIds: pagePanels.map((panel) => panel.id),
          activePanelId: pagePanels[0]?.id ?? null,
        }],
        focusedGroupId: groupId,
        layout: "single" as const,
        layoutSizes: {},
      };
    });
    const oldState = {
      version: 3,
      selectedProjectId: "projekt-a",
      panels,
      workspaces: pages,
      activeWorkspaceId: "page-6",
      maximizedPanelId: null,
      focusedPanelId: "panel-6",
    };
    window.localStorage.setItem(
      LEGACY_LAYOUT_STORAGE_KEYS[0],
      JSON.stringify({ state: oldState, version: 3 }),
    );

    expect(migrateLegacyLayoutStorage(window.localStorage)).toBe(true);
    const envelope = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "null") as {
      state: LayoutState;
      version: number;
    };

    expect(envelope.version).toBe(4);
    expect(envelope.state).toMatchObject({
      version: 4,
      selectedProjectId: "projekt-a",
      activePageId: "page-6",
    });
    expect(envelope.state.pages).toHaveLength(8);
    expect(envelope.state.pages.map((page) => page.name)).toEqual(pages.map((page) => page.name));
    expect(envelope.state.panels.map((panel) => panel.id)).toEqual(panels.map((panel) => panel.id));
    expect(envelope.state.pages.flatMap((page) => page.groups.flatMap((group) => group.panelIds))).toHaveLength(10);
    expect(window.localStorage.getItem(LEGACY_LAYOUT_STORAGE_KEYS[0])).not.toBeNull();
  });

  it("behält die Arbeitsflächen-Struktur, wenn alle Panels unbekannt sind", () => {
    const parsed = parseStoredLayout({
      version: 3,
      selectedProjectId: null,
      panels: [
        { id: "unbekannt-1", type: "future-tool", projectId: null, previewId: null, reloadKey: 0 },
      ],
      workspaces: [{
        id: "page-1",
        name: "Entwicklung",
        groups: [{ id: "group", panelIds: ["unbekannt-1"], activePanelId: "unbekannt-1" }],
        focusedGroupId: "group",
        layout: "single",
        layoutSizes: {},
      }],
      activeWorkspaceId: "page-1",
      maximizedPanelId: null,
      focusedPanelId: null,
    });

    expect(parsed.panels).toEqual([]);
    expect(parsed.pages[0]?.name).toBe("Entwicklung");
    expect(parsed.pages[0]?.groups[0]?.panelIds).toEqual([]);
    expect(parsed.activePageId).toBe("page-1");
  });

  it("shows only the focused group on mobile", () => {
    expect(visiblePanels(twoPanelLayout, true).map((panel) => panel.id)).toEqual(["right"]);
  });

  it("shows the active tab of every group on desktop", () => {
    expect(visiblePanels(twoPanelLayout, false).map((panel) => panel.id)).toEqual(["left", "right"]);
  });

  it("shows only a maximized panel", () => {
    expect(visiblePanels({ ...twoPanelLayout, maximizedPanelId: "left" }, false).map((panel) => panel.id)).toEqual(["left"]);
  });

  it("focuses an existing matching tool instead of loading it twice", () => {
    const firstId = useLayoutStore.getState().openPanel({ type: "t3-code", projectId: "chappie" });
    const repeatedId = useLayoutStore.getState().openPanel({ type: "t3-code", projectId: "chappie" });

    expect(repeatedId).toBe(firstId);
    expect(useLayoutStore.getState().panels).toHaveLength(1);
    expect(useLayoutStore.getState().focusedPanelId).toBe(firstId);
  });

  it("öffnet Code-Server-Panels mit anderen Zielordnern als eigene Bereiche", () => {
    useLayoutStore.getState().openPanel({ type: "code-server", projectId: "chappie" });
    const folderId = useLayoutStore.getState().openPanel({
      type: "code-server",
      projectId: "chappie",
      codeServerFolder: "/home/user/projects/other",
    });

    expect(folderId).not.toBeNull();
    const panels = useLayoutStore.getState().panels;
    expect(panels).toHaveLength(2);
    expect(panels[1]).toMatchObject({ type: "code-server", codeServerFolder: "/home/user/projects/other" });

    const repeatedId = useLayoutStore.getState().openPanel({
      type: "code-server",
      projectId: "chappie",
      codeServerFolder: "/home/user/projects/other",
    });
    expect(repeatedId).toBe(folderId);
    expect(useLayoutStore.getState().panels).toHaveLength(2);
  });

  it("allows independent terminal sessions in the same tab group", () => {
    useLayoutStore.getState().openPanel({ type: "terminal" });
    useLayoutStore.getState().openPanel({ type: "terminal" });
    expect(useLayoutStore.getState().panels.map((panel) => panel.type)).toEqual(["terminal", "terminal"]);
  });

  it("erlaubt mehrere Hermes-Panels und persistiert deren SPA-Pfad", () => {
    const firstId = useLayoutStore.getState().openPanel({ type: "hermes" });
    const secondId = useLayoutStore.getState().openPanel({ type: "hermes" });
    expect(firstId).not.toBe(secondId);
    expect(useLayoutStore.getState().panels).toHaveLength(2);
    useLayoutStore.getState().updateHermesPanel(firstId!, { hermesAdminPath: "/cron/jobs" });
    expect(useLayoutStore.getState().panels.find((panel) => panel.id === firstId)).toMatchObject({ hermesAdminPath: "/cron/jobs" });
  });

  it("allows multiple independent Codex and OpenCode panels", () => {
    useLayoutStore.getState().openPanel({ type: "codex", projectId: "chappie" });
    useLayoutStore.getState().openPanel({ type: "codex", projectId: "chappie" });
    useLayoutStore.getState().openPanel({ type: "opencode", projectId: "chappie" });
    expect(useLayoutStore.getState().panels.map((panel) => panel.type)).toEqual(["codex", "codex", "opencode"]);
  });

  it("deckelt gleichzeitige Laufzeiten am Limit, ohne bestehende Sitzungen zu verwerfen", () => {
    for (let index = 0; index < WRAPT_LIMITS.maxResidentTools; index += 1) {
      expect(useLayoutStore.getState().openPanel({ type: "terminal" })).not.toBeNull();
    }
    expect(useLayoutStore.getState().openPanel({ type: "terminal" })).toBeNull();
    expect(useLayoutStore.getState().panels).toHaveLength(WRAPT_LIMITS.maxResidentTools);
  });

  it("keeps up to eight independently named pages", () => {
    for (let index = 2; index <= 8; index += 1) {
      expect(useLayoutStore.getState().addPage(`Fläche ${index}`)).not.toBeNull();
    }
    expect(useLayoutStore.getState().addPage("Zu viel")).toBeNull();
    expect(useLayoutStore.getState().pages.map((page) => page.name)).toHaveLength(8);
  });

  it("keeps tools alive when a group is dissolved by moving its tabs", () => {
    const first = useLayoutStore.getState().openPanel({ type: "terminal" })!;
    const secondGroup = useLayoutStore.getState().addGroup()!;
    const second = useLayoutStore.getState().openPanel({ type: "terminal", groupId: secondGroup })!;
    useLayoutStore.getState().removeGroup(secondGroup);

    const state = useLayoutStore.getState();
    expect(state.panels.map((panel) => panel.id)).toEqual([first, second]);
    expect(state.pages[0]?.groups).toHaveLength(1);
    expect(state.pages[0]?.groups[0]?.panelIds).toEqual([first, second]);
  });
});
