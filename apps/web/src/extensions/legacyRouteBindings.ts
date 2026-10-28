import { pageContributionSchema, routeContributionSchema, type RouteContribution } from "@wrapt/extension-contracts";
import { Dashboard } from "../views/Dashboard";
import { loadRouteWithRecovery } from "../lib/routeModules";
import type { PageRouteRegistry, PageModuleLoader, PageRouteOwnerBatch, PageRuntimeBinding, RouteRuntimeBinding } from "./pageRouteRegistry";

interface LegacyPageRouteDefinition {
  readonly page: {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
  };
  readonly route: RouteContribution;
  readonly pageRuntime: PageRuntimeBinding;
  readonly routeRuntime: RouteRuntimeBinding;
}

export interface LegacyPageRouteOwner {
  readonly ownerId: string;
  readonly batch: PageRouteOwnerBatch;
}

export interface LegacyHostRouteDefinition {
  readonly id: "app-shell" | "not-found";
  readonly kind: "layout" | "fallback";
  readonly path: null | "*";
  readonly boundary: "app-shell" | "deferred-route";
}

const dashboardModule = Object.freeze({ Dashboard });

export function eagerPageRuntime(exportName: string): PageRuntimeBinding {
  return Object.freeze({
    chunkId: "dashboard",
    exportName,
    loading: "eager",
    recovery: "none",
    load: () => Promise.resolve(dashboardModule),
    eagerModule: dashboardModule,
  });
}

export function lazyPageRuntime(
  chunkId: string,
  exportName: string,
  sourceLoader: PageModuleLoader,
): PageRuntimeBinding {
  return Object.freeze({
    chunkId,
    exportName,
    loading: "lazy",
    recovery: "stale-chunk",
    load: () => loadRouteWithRecovery(sourceLoader),
  });
}

export function routeRuntime(
  prefetchPathPrefix?: string,
  aliasBehavior: RouteRuntimeBinding["aliasBehavior"] = "render",
): RouteRuntimeBinding {
  return Object.freeze({
    boundary: "deferred-route",
    aliasBehavior,
    ...(prefetchPathPrefix === undefined ? {} : { prefetchPathPrefix }),
  });
}

export function standardRoute(
  id: string,
  pageId: string,
  path: string,
  overrides: Partial<
    Omit<RouteContribution, "id" | "pageId" | "path" | "aliases">
  > & { readonly aliases?: readonly string[] } = {},
): RouteContribution {
  return routeContributionSchema.parse({
    id,
    pageId,
    path,
    shell: "standard",
    persistent: true,
    prefetch: "idle",
    projectContext: false,
    topbar: true,
    breadcrumbs: true,
    standaloneActions: false,
    mobileNavigation: false,
    ...overrides,
  });
}

export function standaloneRoute(
  id: string,
  pageId: string,
  path: string,
): RouteContribution {
  return routeContributionSchema.parse({
    id,
    pageId,
    path,
    shell: "standalone",
    persistent: false,
    prefetch: "idle",
    projectContext: false,
    topbar: false,
    breadcrumbs: false,
    standaloneActions: false,
    mobileNavigation: false,
  });
}

export function owner(
  ownerId: string,
  definitions: readonly LegacyPageRouteDefinition[],
): LegacyPageRouteOwner {
  return Object.freeze({
    ownerId,
    batch: Object.freeze({
      pages: Object.freeze(
        definitions.map((definition) =>
          Object.freeze({
            contribution: pageContributionSchema.parse(definition.page),
            runtime: definition.pageRuntime,
          }),
        ),
      ),
      routes: Object.freeze(
        definitions.map((definition) =>
          Object.freeze({
            contribution: definition.route,
            runtime: definition.routeRuntime,
          }),
        ),
      ),
    }),
  });
}

export const legacyHostRoutes: readonly LegacyHostRouteDefinition[] =
  Object.freeze([
    Object.freeze({
      id: "app-shell",
      kind: "layout",
      path: null,
      boundary: "app-shell",
    }),
    Object.freeze({
      id: "not-found",
      kind: "fallback",
      path: "*",
      boundary: "deferred-route",
    }),
  ]);

export function registerLegacyPageRoutes(registry: PageRouteRegistry, owners: readonly LegacyPageRouteOwner[]): void {
  for (const builtIn of owners) {
    registry.replaceOwner(builtIn.ownerId, builtIn.batch);
  }
}
