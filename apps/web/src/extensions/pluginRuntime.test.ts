import { describe, expect, it } from "vitest";
import type { ExtensionRegistrySummary } from "@wrapt/extension-contracts";
import {
  pluginDraftContentSchema,
  pluginDraftSchema,
  pluginExampleSchema,
  type PluginDraft,
  type PluginExample,
} from "@wrapt/contracts";
import {
  pluginRuntimeOwnerId,
  pluginToolRoutePath,
  resolveActivePluginContents,
} from "./pluginRuntime";

function content(slug: string, surfaces: PluginExample["surfaces"] = ["page"]) {
  return pluginDraftContentSchema.parse({
    slug,
    name: slug,
    description: `Beschreibung für ${slug}.`,
    publisher: "wrapt",
    category: "productivity",
    version: "1.0.0",
    routePath: `/plugins/view/${slug}`,
    pageMode: "blocks",
    iframeUrl: null,
    html: "",
    blocks: [{ id: "main", type: "heading", title: slug, content: "Inhalt", actionId: null }],
    functions: [],
    orbit: { enabled: false, title: slug, description: "", placement: "orbit", nodeType: "note", accent: "accent" },
    wizard: {
      goal: "",
      audience: "",
      design: "klar",
      layout: "einspaltig",
      tone: "direkt",
      includeHtml: false,
      includeIframe: false,
      includeOrbit: false,
      additionalDescription: "",
      wishes: "",
      agent: "opencode",
      permissions: [],
      surfaces,
      dataNeeds: [],
      interactions: [],
      mobileBehavior: "responsive",
    },
    sourceExampleId: null,
    status: "draft",
    surfaces,
  });
}

function draft(slug: string, activationStatus: PluginDraft["activationStatus"]): PluginDraft {
  return pluginDraftSchema.parse({
    ...content(slug, ["page", "sidebar"]),
    id: "11111111-1111-4111-8111-111111111111",
    activationStatus,
    createdAt: "2026-08-22T08:00:00.000Z",
    updatedAt: "2026-08-22T08:00:00.000Z",
  });
}

function datedDraft(slug: string, updatedAt: string, name: string): PluginDraft {
  return pluginDraftSchema.parse({
    ...content(slug, ["page", "sidebar"]),
    id: updatedAt.startsWith("2026-08-23")
      ? "22222222-2222-4222-8222-222222222222"
      : "11111111-1111-4111-8111-111111111111",
    name,
    activationStatus: "active",
    createdAt: "2026-08-22T08:00:00.000Z",
    updatedAt,
  });
}

function example(slug: string): PluginExample {
  return pluginExampleSchema.parse({
    ...content(slug, ["page", "sidebar"]),
    exampleId: slug,
    sourceDirectory: `extensions/plugins/${slug}`,
  });
}

function registry(...entries: Array<[id: string, lifecycle: ExtensionRegistrySummary["lifecycle"]]>) {
  return entries.map(([id, lifecycle]) => ({ id, lifecycle })) as ExtensionRegistrySummary[];
}

describe("deklarative Plugin-Runtime", () => {
  it("bevorzugt aktive lokale Drafts und ignoriert deaktivierte Quellen", () => {
    const result = resolveActivePluginContents(
      [draft("focus", "active"), draft("paused", "disabled")],
      [example("focus"), example("paused"), example("store-only")],
      registry(
        ["wrapt.example.focus", "active"],
        ["wrapt.example.paused", "active"],
        ["wrapt.example.store-only", "available"],
      ),
    );

    expect(result.map((item) => item.content.slug)).toEqual(["focus"]);
    expect(result[0]?.extensionId).toBe("wrapt.local.focus");
  });

  it("aktiviert installierte Beispiele nur mit aktivem Registry-Zustand", () => {
    const result = resolveActivePluginContents(
      [],
      [example("focus"), example("timer")],
      registry(["wrapt.example.focus", "active"], ["wrapt.example.timer", "disabled"]),
    );

    expect(result.map((item) => item.extensionId)).toEqual(["wrapt.example.focus"]);
  });

  it("liefert stabile Owner und einen konfliktfreien Sidebar-Werkzeugpfad", () => {
    expect(pluginRuntimeOwnerId("Focus Timer")).toBe("wrapt.plugin.focus-timer");
    expect(pluginToolRoutePath("Focus Timer")).toBe("/plugins/tool/focus-timer");
  });

  it("verwendet bei alten doppelten Slugs deterministisch den neuesten aktiven Draft", () => {
    const result = resolveActivePluginContents(
      [
        datedDraft("doppelt", "2026-08-23T08:00:00.000Z", "Neu"),
        datedDraft("doppelt", "2026-08-22T08:00:00.000Z", "Alt"),
      ],
      [],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.content.name).toBe("Neu");
  });
});
