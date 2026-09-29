// @vitest-environment jsdom
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import {
  pageContributionSchema,
  routeContributionSchema,
} from "@wrapt/extension-contracts";
import { registerLegacyPageRoutes } from "./legacyPageRoutes";
import { PageRouteRegistry } from "./pageRouteRegistry";
import { CanonicalAliasRedirect, routeHostElements } from "./routeHost";

type RouteElementLike = ReactElement<{
  path?: string;
  index?: boolean;
  element?: unknown;
}>;

function flattenRoutes(node: ReactNode): RouteElementLike[] {
  const routes: RouteElementLike[] = [];
  const children = Children.toArray(node);
  for (const child of children) {
    if (!isValidElement(child)) continue;
    if (child.type === RouteSymbol) {
      routes.push(child as RouteElementLike);
    }
    const nested = (child.props as { children?: ReactNode }).children;
    if (nested !== undefined) routes.push(...flattenRoutes(nested));
  }
  return routes;
}

// Route-Elemente identifizieren sich nicht über eine importierbare Referenz;
// wir vergleichen gegen die Referenz, die routeHostElements selbst nutzt.
import { Route as RouteSymbol } from "react-router";

function buildRegistry(): PageRouteRegistry {
  const registry = new PageRouteRegistry();
  registerLegacyPageRoutes(registry);
  return registry;
}

describe("routeHostElements", () => {
  it("bildet alle Legacy-Routen einschließlich Standalone, Index und 404 ab", () => {
    const registry = buildRegistry();
    const routes = flattenRoutes(routeHostElements(registry.getSnapshot()));

    const standalone = routes.filter((route) =>
      ["previews/fenster/:groupId", "previews/live", "terminal/fenster/:runtimeId"].includes(route.props.path ?? ""),
    );
    expect(standalone).toHaveLength(3);

    const indexRoutes = routes.filter((route) => route.props.index === true);
    expect(indexRoutes).toHaveLength(1);

    const wildcard = routes.filter((route) => route.props.path === "*");
    expect(wildcard).toHaveLength(1);

    expect(routes.length).toBeGreaterThanOrEqual(26);
  });

  it("führt den Alias /gallery als Redirect auf die kanonische Dateien-Route", () => {
    const registry = buildRegistry();
    const routes = flattenRoutes(routeHostElements(registry.getSnapshot()));

    const gallery = routes.find((route) => route.props.path === "gallery");
    expect(gallery).toBeDefined();
    const element = gallery?.props.element as ReactElement<{ target?: string }>;
    expect(element.type).toBe(CanonicalAliasRedirect);
    expect(element.props.target).toBe("/files");
  });

  it("erhält Query und Hash beim kompatiblen Orbit-Alias", async () => {
    function LocationOutput() {
      const location = useLocation();
      return <output>{`${location.pathname}${location.search}${location.hash}`}</output>;
    }

    const { container } = render(
      <MemoryRouter initialEntries={["/workbench?board=team&focus=node-4#canvas"]}>
        <Routes>
          <Route path="/workbench" element={<CanonicalAliasRedirect target="/orbit" />} />
          <Route path="/orbit" element={<LocationOutput />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(container.querySelector("output")?.textContent).toBe(
        "/orbit?board=team&focus=node-4#canvas",
      );
    });
  });

  it("hostet eine neu registrierte Extension-Route ohne Core-Änderung", () => {
    const registry = buildRegistry();
    const pageId = "workbench.test.page.main";
    registry.replaceOwner("workbench.test", {
      pages: [
        {
          contribution: pageContributionSchema.parse({ id: pageId, title: "Testfläche" }),
          runtime: {
            chunkId: "test",
            exportName: "TestPage",
            loading: "lazy",
            recovery: "stale-chunk",
            load: () => Promise.resolve({ TestPage: () => null }),
          },
        },
      ],
      routes: [
        {
          contribution: routeContributionSchema.parse({
            id: "workbench.test.route.main",
            pageId,
            path: "/test-flaeche",
          }),
          runtime: {
            boundary: "deferred-route",
            aliasBehavior: "render",
          },
        },
      ],
    });

    const routes = flattenRoutes(routeHostElements(registry.getSnapshot()));
    expect(routes.some((route) => route.props.path === "test-flaeche")).toBe(true);
  });

  it("entfernt eine Route wieder, wenn ihr Owner disposed wird", () => {
    const registry = buildRegistry();
    const pageId = "workbench.test.page.main";
    registry.replaceOwner("workbench.test", {
      pages: [
        {
          contribution: pageContributionSchema.parse({ id: pageId, title: "Testfläche" }),
          runtime: {
            chunkId: "test",
            exportName: "TestPage",
            loading: "lazy",
            recovery: "stale-chunk",
            load: () => Promise.resolve({ TestPage: () => null }),
          },
        },
      ],
      routes: [
        {
          contribution: routeContributionSchema.parse({
            id: "workbench.test.route.main",
            pageId,
            path: "/test-flaeche",
          }),
          runtime: {
            boundary: "deferred-route",
            aliasBehavior: "render",
          },
        },
      ],
    });
    expect(registry.removeOwner("workbench.test")).toBe(true);

    const routes = flattenRoutes(routeHostElements(registry.getSnapshot()));
    expect(routes.some((route) => route.props.path === "test-flaeche")).toBe(false);
  });
});
