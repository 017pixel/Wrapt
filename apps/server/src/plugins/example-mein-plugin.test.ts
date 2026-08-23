import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pluginDraftContentSchema, pluginIconPresetSchema } from "@wrapt/contracts";
import {
  extensionManifestV1Schema,
  routeContributionSchema,
  routePathCollisionKey,
  routePathSchema,
} from "@wrapt/extension-contracts";

const packageDirectory = resolve(import.meta.dirname, "../../../../extensions/plugins/mein-plugin");

const manifestRaw = JSON.parse(await readFile(join(packageDirectory, "extension.json"), "utf8")) as object;
const manifest = extensionManifestV1Schema.parse(manifestRaw);
const draft = pluginDraftContentSchema.parse(
  JSON.parse(await readFile(join(packageDirectory, "plugin.json"), "utf8")) as unknown,
);

describe("Plugin-Paket mein-plugin", () => {
  it("deklariert ein gültiges Manifest mit Page- und Route-Contribution", () => {
    expect(manifest.id).toBe("wrapt.example.mein-plugin");
    expect(manifest.name).toBe("Mein erstes Plugin");
    expect(manifest.version).toBe(draft.version);
    expect(manifest.category).toBe("productivity");
    expect(manifest.permissions).toEqual([]);
    expect(manifest.activationEvents).toEqual([]);

    expect(manifest.contributes.pages).toHaveLength(1);
    expect(manifest.contributes.routes).toHaveLength(1);
    const route = manifest.contributes.routes![0]!;
    expect(route.pageId).toBe(manifest.contributes.pages![0]!.id);
    expect(route.path).toBe("/plugins/tool/mein-plugin");
    routeContributionSchema.parse(route);
  });

  it("registriert die neue Seite sichtbar als Sidebar-Werkzeugseite", () => {
    expect(draft.surfaces).toEqual(["page", "sidebar"]);
    expect(draft.wizard.surfaces).toEqual(["page", "sidebar"]);
    expect(manifest.contributes.navigation).toHaveLength(1);
    expect(manifest.contributes.navigation?.[0]).toMatchObject({
      routeId: "wrapt.example.mein-plugin.route.main",
      label: "Mein erstes Plugin",
      group: "tools",
      visibleByDefault: true,
    });
    expect(manifest.contributes.routes![0]?.path).toBe("/plugins/tool/mein-plugin");
    expect(routeContributionSchema.parse(manifest.contributes.routes![0]).mobileNavigation).toBe(true);
  });

  it("nutzt die kanonische Inhaltsroute ohne Kollision mit der generischen Host-Route", () => {
    expect(draft.routePath).toBe("/plugins/view/mein-plugin");
    expect(() => routePathSchema.parse(draft.routePath)).not.toThrow();
    expect(draft.routePath).not.toBe("/plugins/view/:pluginSlug");
    expect(routePathCollisionKey(draft.routePath)).toBe("/plugins/view/mein-plugin");
    expect(routePathCollisionKey("/plugins/view/:pluginSlug")).toBe("/plugins/view/:");
    expect(routePathCollisionKey(draft.routePath)).not.toBe(routePathCollisionKey("/plugins/view/:pluginSlug"));
  });

  it("liefert den Hello-World-Inhalt als bereinigtes HTML ohne Iframe", () => {
    expect(draft.pageMode).toBe("html");
    expect(draft.iframeUrl).toBeNull();
    expect(draft.wizard.includeIframe).toBe(false);
    expect(draft.wizard.includeHtml).toBe(true);
    expect(draft.html).toContain("Hallo");
    expect(draft.html.toLowerCase()).not.toContain("<script");
    expect(draft.html.toLowerCase()).not.toContain("<iframe");
    expect(draft.html.toLowerCase()).not.toContain("onerror");
    expect(draft.html.toLowerCase()).not.toContain("javascript:");
    expect(draft.html).not.toMatch(/style\s*=/i);
  });

  it("hält Blöcke, Funktionen und Aktionen konsistent", () => {
    const intro = draft.blocks.find((block) => block.id === "intro");
    expect(intro).toMatchObject({ type: "heading", title: "Deine Seite", content: "Hier beginnt dein Plugin.", actionId: null });

    const functionIds = new Set(draft.functions.map((item) => item.id));
    for (const block of draft.blocks) {
      if (block.actionId === null) continue;
      expect(functionIds.has(block.actionId)).toBe(true);
    }
    const allowedActions = [
      "open-route",
      "copy-text",
      "toggle-panel",
      "notify",
      "open-overlay",
      "open-bottom-sheet",
      "set-filter",
      "save-state",
      "load-state",
      "run-command",
      "refresh-data",
      "start-timer",
      "stop-timer",
      "reset-timer",
    ] as const;
    for (const item of draft.functions) {
      expect(allowedActions).toContain(item.action);
      if (item.action === "open-route") {
        expect(item.value.startsWith("/") || item.value.startsWith("https://")).toBe(true);
      }
    }
    for (const block of draft.blocks) {
      if (block.type !== "button") expect(block.actionId).toBeNull();
    }
  });

  it("bleibt mobil bedienbar und verzichtet auf feste Breiten", () => {
    expect(draft.wizard.mobileBehavior).toBe("responsive");
    expect(draft.wizard.layout).toBe("einspaltig");
    expect(draft.html).not.toMatch(/width\s*:\s*\d+px/i);
  });

  it("nutzt das kontrollierte Icon-Codewort folder und keine Orbit-Fläche", () => {
    expect(pluginIconPresetSchema.options).toContain("folder");
    expect(draft.icon).toBe("folder");
    expect(draft.orbit.enabled).toBe(false);
    expect(draft.wizard.includeOrbit).toBe(false);
    expect(draft.surfaces).not.toContain("orbit");
  });

  it("weist fehlerhafte Varianten des Pakets zurück", async () => {
    expect(pluginDraftContentSchema.safeParse({ ...draft, icon: "../unsafe" }).success).toBe(false);
    expect(pluginDraftContentSchema.safeParse({ ...draft, routePath: "javascript:alert(1)" }).success).toBe(false);
    expect(pluginDraftContentSchema.safeParse({ ...draft, version: "0.1" }).success).toBe(false);
    expect(pluginDraftContentSchema.safeParse({
      ...draft,
      functions: [{ id: "x", label: "X", action: "window.open", value: "" }],
    }).success).toBe(false);

    const broken = structuredClone(manifestRaw) as Record<string, unknown>;
    Reflect.set(broken, "permissions", ["projects.read"]);
    expect(extensionManifestV1Schema.safeParse(broken).success).toBe(false);
  });
});
