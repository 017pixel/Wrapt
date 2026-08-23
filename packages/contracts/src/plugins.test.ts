import { describe, expect, it } from "vitest";
import {
  pluginActivationStatusSchema,
  pluginCapabilitySchema,
  pluginCreationModeSchema,
  pluginDraftContentSchema,
  pluginIconNames,
  pluginSurfaceContributionSchema,
} from "./plugins.js";

const legacyDraft = {
  slug: "notizen",
  name: "Notizen",
  description: "Eine lokale Notizfläche.",
  publisher: "local",
  category: "productivity",
  version: "0.1.0",
  routePath: "/plugins/view/notizen",
  pageMode: "blocks" as const,
  iframeUrl: null,
  html: "",
  blocks: [{ id: "intro", type: "heading" as const, title: "Notizen", content: "Text", actionId: null }],
  functions: [],
  orbit: {
    enabled: false,
    title: "Notizen",
    description: "",
    placement: "orbit" as const,
    nodeType: "note" as const,
    accent: "accent" as const,
  },
  wizard: {
    goal: "Notizen sammeln",
    audience: "Ich",
    design: "klar" as const,
    layout: "einspaltig" as const,
    tone: "direkt" as const,
    includeHtml: false,
    includeIframe: false,
    includeOrbit: false,
    additionalDescription: "",
    wishes: "",
    agent: "codex" as const,
    permissions: [],
  },
  sourceExampleId: null,
  status: "draft" as const,
};

describe("Plugin-Verträge V2", () => {
  it("liest alte Drafts und ergänzt sichere V2-Defaults", () => {
    const parsed = pluginDraftContentSchema.parse(legacyDraft);

    expect(parsed.formatVersion).toBe(2);
    expect(parsed.creationMode).toBe("visual");
    expect(parsed.activationStatus).toBe("draft");
    expect(parsed.capabilities).toEqual([]);
    expect(parsed.surfaces).toEqual(["page"]);
    expect(parsed.revision).toBe(0);
    expect(parsed.wizard.additionalRequirements).toBe("");
    expect(parsed.wizard.restartBehavior).toBe("ask");
    expect(parsed.wizard.iconDescription).toBe("");
    expect(parsed.icon).toBe("extensions");
  });

  it("beschreibt kontrollierte Plugin-Fähigkeiten und Oberflächen", () => {
    expect(pluginCreationModeSchema.parse("ai")).toBe("ai");
    expect(pluginActivationStatusSchema.parse("active")).toBe("active");
    expect(pluginCapabilitySchema.parse({
      id: "filter-projects",
      label: "Projekte filtern",
      kind: "action",
      surface: "dashboard",
      description: "Setzt den Projektfilter.",
      permission: null,
      enabled: true,
    })).toMatchObject({ surface: "dashboard", kind: "action" });
    expect(pluginSurfaceContributionSchema.parse({
      id: "quick-panel",
      surface: "right-rail",
      title: "Schnellpanel",
      description: "Zeigt kleine Projektaktionen.",
      mobileBehavior: "bottom-sheet",
      token: "accent",
    })).toMatchObject({ mobileBehavior: "bottom-sheet" });
  });

  it("weist freie Host-Flächen und unbekannte Theme-Tokens zurück", () => {
    expect(pluginCapabilitySchema.safeParse({
      id: "raw-dom",
      label: "Raw DOM",
      kind: "action",
      surface: "body",
      description: "",
      permission: null,
      enabled: true,
    }).success).toBe(false);
    expect(pluginSurfaceContributionSchema.safeParse({
      id: "panel",
      surface: "right-rail",
      title: "Panel",
      description: "Panel",
      mobileBehavior: "bottom-sheet",
      token: "#ff00aa",
    }).success).toBe(false);
  });

  it("bietet genau 25 sichere Icon-Vorgaben und erlaubt einen Code-Namen", () => {
    expect(pluginIconNames).toHaveLength(25);
    expect(new Set(pluginIconNames).size).toBe(25);
    expect(pluginDraftContentSchema.parse({ ...legacyDraft, icon: "clock" }).icon).toBe("clock");
    expect(pluginDraftContentSchema.safeParse({ ...legacyDraft, icon: "../unsafe" }).success).toBe(false);
  });
});
