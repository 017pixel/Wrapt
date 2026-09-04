import { describe, expect, it } from "vitest";
import type { PluginExample } from "@wrapt/contracts";
import { draftFromExample, emptyPluginDraft } from "./pluginDefaults";

describe("Plugin-Standardwerte", () => {
  it("legt eine eigene Seite standardmäßig als sichtbare Sidebar-Werkzeugseite an", () => {
    const draft = emptyPluginDraft("sichtbare-seite");

    expect(draft.surfaces).toEqual(["page", "sidebar"]);
    expect(draft.wizard.surfaces).toEqual(["page", "sidebar"]);
    expect(draft.routePath).toBe("/plugins/view/sichtbare-seite");
    expect(draft.wizard.includeOrbit).toBe(false);
    expect(draft.orbit.enabled).toBe(false);
  });

  it("übernimmt ein Store-Beispiel als persönlichen Draft ohne Store-Markierung", () => {
    const example = {
      ...emptyPluginDraft("beispiel"),
      exampleId: "beispiel",
      sourceDirectory: "extensions/plugins/beispiel",
    } as PluginExample;

    expect(draftFromExample(example)).toMatchObject({ sourceExampleId: null, status: "draft" });
  });
});
