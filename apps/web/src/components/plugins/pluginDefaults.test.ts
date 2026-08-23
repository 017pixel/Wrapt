import { describe, expect, it } from "vitest";
import { emptyPluginDraft } from "./pluginDefaults";

describe("Plugin-Standardwerte", () => {
  it("legt eine eigene Seite standardmäßig als sichtbare Sidebar-Werkzeugseite an", () => {
    const draft = emptyPluginDraft("sichtbare-seite");

    expect(draft.surfaces).toEqual(["page", "sidebar"]);
    expect(draft.wizard.surfaces).toEqual(["page", "sidebar"]);
    expect(draft.routePath).toBe("/plugins/view/sichtbare-seite");
    expect(draft.wizard.includeOrbit).toBe(false);
    expect(draft.orbit.enabled).toBe(false);
  });
});
