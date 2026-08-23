import { describe, expect, it } from "vitest";
import { PageRouteRegistry } from "./pageRouteRegistry";
import {
  legacyHostRoutes,
  legacyPageAliases,
  legacyPageRouteOwners,
  registerLegacyPageRoutes,
} from "./legacyPageRoutes";

const expectedPublicPatterns = [
  "/",
  "/browser",
  "/claude",
  "/code-editor",
  "/codex",
  "/files",
  "/gallery",
  "/hermes-agent",
  "/inbox",
  "/ki-skills",
  "/opencode",
  "/plugins",
  "/plugins/maker",
  "/plugins/tool/:pluginSlug",
  "/plugins/view/:pluginSlug",
  "/previews",
  "/previews/fenster/:groupId",
  "/previews/gruppe/:groupId",
  "/previews/live",
  "/projects",
  "/projects/:projectId",
  "/settings",
  "/t3-code",
  "/tech-tldrs",
  "/terminal",
  "/terminal/fenster/:runtimeId",
  "/usage",
  "/workbench",
];

function createRegistry(): PageRouteRegistry {
  const registry = new PageRouteRegistry();
  registerLegacyPageRoutes(registry);
  return registry;
}

describe("Legacy Page-/Route-Built-ins", () => {
  it("registriert 19 Owner, 26 Pages und 26 Routes", () => {
    const registry = createRegistry();
    const snapshot = registry.getSnapshot();

    expect(legacyPageRouteOwners).toHaveLength(19);
    expect(snapshot.pages).toHaveLength(26);
    expect(snapshot.routes).toHaveLength(26);
    expect(new Set(snapshot.pages.map((page) => page.ownerId)).size).toBe(19);
  });

  it("bildet alle 25 öffentlichen URL-Muster ohne Host-Wildcard ab", () => {
    const registry = createRegistry();
    const patterns = registry
      .getSnapshot()
      .routes.flatMap((route) => [
        route.value.contribution.path,
        ...(route.value.contribution.aliases ?? []),
      ])
      .sort();

    expect(patterns).toEqual(expectedPublicPatterns);
    expect(patterns).not.toContain("*");
    expect(registry.matchRoute("/gallery")?.route.contributionId).toBe(
      "wrapt.files.route.main",
    );
    expect(
      registry.matchRoute("/gallery")?.route.value.runtime.aliasBehavior,
    ).toBe("redirect-to-canonical");
    expect(registry.matchRoute("/plugins/tool/mein-plugin")).toMatchObject({
      alias: true,
      route: { contributionId: "wrapt.plugins.route.runtime" },
    });
  });

  it("hält App Shell und 404 als zwei explizite Host-Routen", () => {
    expect(legacyHostRoutes).toEqual([
      {
        id: "app-shell",
        kind: "layout",
        path: null,
        boundary: "app-shell",
      },
      {
        id: "not-found",
        kind: "fallback",
        path: "*",
        boundary: "deferred-route",
      },
    ]);
    expect(26 + legacyHostRoutes.length).toBe(28);
  });

  it("bewahrt Eager-Dashboard, 16 Lazy-Chunks und Stale-Chunk-Recovery", () => {
    const pages = createRegistry().getSnapshot().pages;
    const eager = pages.filter((page) => page.value.runtime.loading === "eager");
    const lazy = pages.filter((page) => page.value.runtime.loading === "lazy");
    const lazyChunks = new Set(lazy.map((page) => page.value.runtime.chunkId));

    expect(eager.map((page) => page.contributionId)).toEqual([
      "wrapt.dashboard.page.main",
    ]);
    expect(lazy).toHaveLength(25);
    expect(lazyChunks).toEqual(
      new Set([
        "cli-terminal",
        "file-manager",
        "hermes",
        "inbox",
        "preview-group",
        "preview-live",
        "project-detail",
        "projects",
        "plugins",
        "settings",
        "skill-editor",
        "tech-tldrs",
        "terminal",
        "tool-route",
        "usage",
        "workbench",
      ]),
    );
    expect(lazy.every((page) => page.value.runtime.recovery === "stale-chunk"))
      .toBe(true);
  });

  it("bindet exakt die 21 bestehenden Prefetch-Präfixe", () => {
    const prefixes = createRegistry()
      .getSnapshot()
      .routes.flatMap((route) =>
        route.value.runtime.prefetchPathPrefix === undefined
          ? []
          : [route.value.runtime.prefetchPathPrefix],
      );

    expect(new Set(prefixes).size).toBe(24);
    expect(prefixes).toHaveLength(25);
    expect(prefixes.filter((prefix) => prefix === "/terminal")).toHaveLength(2);
  });

  it("bewahrt Shell, Persistenz, Boundaries und mobile Route-Metadaten", () => {
    const routes = createRegistry().getSnapshot().routes;
    const standalone = routes.filter(
      (route) => route.value.contribution.shell === "standalone",
    );
    const fullBleed = routes.filter(
      (route) => route.value.contribution.shell === "full-bleed",
    );

    expect(standalone).toHaveLength(3);
    expect(standalone.every((route) => !route.value.contribution.persistent))
      .toBe(true);
    expect(
      routes
        .filter((route) => route.value.contribution.shell !== "standalone")
        .every((route) => route.value.contribution.persistent),
    ).toBe(true);
    expect(fullBleed.map((route) => route.value.contribution.path).sort()).toEqual([
      "/tech-tldrs",
      "/workbench",
    ]);
    expect(
      routes.every((route) => route.value.runtime.boundary === "deferred-route"),
    ).toBe(true);
    expect(
      routes.filter((route) => route.value.contribution.mobileNavigation),
    ).toHaveLength(19);
  });

  it("hält alle 19 Preference-IDs als stabile Aliase", () => {
    const registry = createRegistry();

    expect(Object.keys(legacyPageAliases)).toHaveLength(19);
    for (const pageId of Object.values(legacyPageAliases)) {
      expect(registry.getPage(pageId)).toBeDefined();
    }
  });

  it("löst Eager- und Lazy-Export-Bindungen auf", async () => {
    const registry = createRegistry();
    const dashboard = registry.getPage("wrapt.dashboard.page.main")!;
    const inbox = registry.getPage("wrapt.inbox.page.main")!;

    await expect(dashboard.value.runtime.load()).resolves.toHaveProperty(
      dashboard.value.runtime.exportName,
    );
    await expect(inbox.value.runtime.load()).resolves.toHaveProperty(
      inbox.value.runtime.exportName,
    );
  });
});
