import { describe, expect, it } from "vitest";
import { migrateSidebarPreferences, useSidebarPreferences, type SidebarSectionKey } from "./sidebarPreferences";

describe("Sidebar-Präferenzen", () => {
  it("migriert Projekt- und Werkzeugbereiche getrennt und erhält beide alten Zustände", async () => {
    const migrated = migrateSidebarPreferences({ collapsedSections: { "orbit-projects": true, tools: false } }) as {
      collapsedSections: Record<SidebarSectionKey, boolean>;
    };

    expect(migrated.collapsedSections["orbit-projects"]).toBe(true);
    expect(migrated.collapsedSections.tools).toBe(true);
    expect(migrated.collapsedSections["orbit-tools"]).toBe(false);

    const changed = { ...migrated.collapsedSections, tools: false };
    expect(changed["orbit-projects"]).toBe(true);
    expect(changed["orbit-tools"]).toBe(false);
  });

  it("behält die getrennten Bereiche beim Upgrade von Version 4 bei", () => {
    const migrated = migrateSidebarPreferences({ collapsedSections: { "orbit-projects": true, "orbit-tools": false, tools: false } }, 4) as {
      collapsedSections: Record<SidebarSectionKey, boolean>;
    };
    expect(migrated.collapsedSections).toMatchObject({ "orbit-projects": true, "orbit-tools": false, tools: false });
  });

  it("blendet Orbit standardmäßig aus und lässt ihn ausdrücklich aktivieren", () => {
    const store = useSidebarPreferences.getState();
    expect(store.isPageVisible("workbench")).toBe(false);
    store.togglePage("workbench");
    expect(useSidebarPreferences.getState().isPageVisible("workbench")).toBe(true);
    useSidebarPreferences.getState().togglePage("workbench");
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
