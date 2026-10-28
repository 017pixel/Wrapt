import { describe, expect, it } from "vitest";
import { migrateSidebarPreferences, useSidebarPreferences } from "./sidebarPreferences";

describe("Sidebar-Präferenzen", () => {
  it("entfernt alte Canvas-Einstellungen und erhält die übrige Navigation", () => {
    const migrated = migrateSidebarPreferences({
      collapsedSections: { "orbit-projects": true, tools: false, workspace: true },
      hiddenOrbitItems: ["tool:terminal"],
      hiddenPages: ["workbench", "files"],
      explicitlyVisibleDefaultPages: ["workbench", "codex"],
      navigationOrder: ["wrapt.orbit.navigation.main", "plugin.navigation.main", "wrapt.files.navigation.main"],
    }, 6);
    expect(migrated.collapsedSections).toEqual({ workspace: true, tools: false, footer: false });
    expect(migrated).not.toHaveProperty("hiddenOrbitItems");
    expect(migrated.hiddenPages).toEqual(["files"]);
    expect(migrated.explicitlyVisibleDefaultPages).toEqual(["codex"]);
    expect(migrated.navigationOrder).toEqual(["plugin.navigation.main", "wrapt.files.navigation.main"]);
  });

  it("erhält den Werkzeugzustand sehr alter Speicherstände", () => {
    expect(migrateSidebarPreferences({ collapsedSections: { "orbit-projects": true, tools: false } }, 3)
      .collapsedSections.tools).toBe(true);
  });

});

describe("Reihenfolge der Sidebar", () => {
  it("aktiviert direktes Ziehen beim Upgrade und erhält die Reihenfolge", () => {
    expect(migrateSidebarPreferences({ navigationOrder: ["b", "a"], navigationReorderEnabled: false }, 5))
      .toMatchObject({ navigationOrder: ["b", "a"], navigationReorderEnabled: true });
    expect(migrateSidebarPreferences({ navigationReorderEnabled: false }, 6).navigationReorderEnabled).toBe(false);
  });

  it("verschiebt vor und nach dem Ziel und erhält andere Gruppen und Plugins", () => {
    useSidebarPreferences.setState({ navigationOrder: ["settings", "plugin", "a", "b", "c"] });
    const move = useSidebarPreferences.getState().moveNavigationBefore;
    move("a", "c", ["a", "b", "c"], true);
    expect(useSidebarPreferences.getState().navigationOrder).toEqual(["settings", "plugin", "b", "c", "a"]);
    move("a", "b", ["a", "b", "c"]);
    expect(useSidebarPreferences.getState().navigationOrder).toEqual(["settings", "plugin", "a", "b", "c"]);
    move("foreign", "a", ["a", "b", "c"]);
    expect(useSidebarPreferences.getState().navigationOrder).toEqual(["settings", "plugin", "a", "b", "c"]);
    useSidebarPreferences.setState({ navigationOrder: [] });
  });
});
