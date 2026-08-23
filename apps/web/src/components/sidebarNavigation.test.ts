import { describe, expect, it } from "vitest";
import { navigationUsesExactMatch } from "./sidebarNavigation";

describe("Sidebar-Navigation", () => {
  it("markiert die Plugin-Übersicht nicht auf einer geöffneten Werkzeugseite", () => {
    expect(navigationUsesExactMatch("/plugins")).toBe(true);
    expect(navigationUsesExactMatch("/plugins/tool/focus-timer")).toBe(false);
    expect(navigationUsesExactMatch("/projects")).toBe(false);
  });
});
