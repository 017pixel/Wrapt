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
