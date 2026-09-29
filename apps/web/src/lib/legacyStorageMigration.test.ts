// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { LAYOUT_STORAGE_KEY, LAYOUT_STORAGE_VERSION } from "../stores/layoutPersistence";
import { migrateLegacyBrowserStorage } from "./legacyStorageMigration";

describe("legacy browser storage migration", () => {
  beforeEach(() => window.localStorage.clear());

  it("führt bisherige Workspace-Keys verlustfrei ins Layout-Schema v4 über", () => {
    const oldValue = JSON.stringify({
      state: {
        version: 3,
        selectedProjectId: "projekt-a",
        panels: [{ id: "terminal-1", type: "terminal", projectId: null, previewId: null, reloadKey: 2 }],
        workspaces: [{
          id: "page-1",
          name: "Entwicklung",
          groups: [{ id: "group-1", panelIds: ["terminal-1"], activePanelId: "terminal-1" }],
          focusedGroupId: "group-1",
          layout: "single",
          layoutSizes: {},
        }],
        activeWorkspaceId: "page-1",
        maximizedPanelId: null,
        focusedPanelId: "terminal-1",
      },
      version: 3,
    });
    window.localStorage.setItem("remote-workplace.workspace.v2", oldValue);

    migrateLegacyBrowserStorage(window.localStorage);

    const migrated = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "null") as {
      state: {
        version: number;
        selectedProjectId: string;
        panels: Array<{ id: string }>;
        pages: Array<{ id: string; name: string; groups: Array<{ panelIds: string[] }> }>;
        activePageId: string;
      };
      version: number;
    };

    expect(migrated.version).toBe(LAYOUT_STORAGE_VERSION);
    expect(migrated.state).toMatchObject({
      version: 4,
      selectedProjectId: "projekt-a",
      activePageId: "page-1",
    });
    expect(migrated.state.panels.map((panel) => panel.id)).toEqual(["terminal-1"]);
    expect(migrated.state.pages).toHaveLength(1);
    expect(migrated.state.pages[0]).toMatchObject({
      id: "page-1",
      name: "Entwicklung",
      groups: [{ panelIds: ["terminal-1"] }],
    });
    expect(window.localStorage.getItem("wrapt.workspace.v2")).toBeNull();
    expect(window.localStorage.getItem("remote-workplace.workspace.v2")).toBe(oldValue);
  });

  it("überschreibt ein bereits vorhandenes Layout nicht mit einem alten Key", () => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, "{\"state\":{},\"version\":4}");
    window.localStorage.setItem("wrapt.workspace.v2", "{\"state\":{\"version\":3},\"version\":3}");

    migrateLegacyBrowserStorage(window.localStorage);

    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe("{\"state\":{},\"version\":4}");
  });
});
