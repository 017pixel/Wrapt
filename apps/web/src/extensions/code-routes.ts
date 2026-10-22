import { contributionIdSchema, extensionIdSchema, pageContributionSchema, routeContributionSchema } from "@wrapt/extension-contracts";
import type { PageRouteRegistrySnapshot, OwnedPageRegistration, OwnedRouteRegistration } from "./pageRouteRegistry";
import { codePluginUi } from "./code-ui";
import { codePageComponent } from "./CodePluginPage";

export function resolveCodePageRoutes(snapshot: PageRouteRegistrySnapshot, codeRevision = 0): PageRouteRegistrySnapshot {
  const builtins = snapshot.pages.map((page) => ({ id: page.contributionId, surface: "page" as const, title: page.value.contribution.title, path: snapshot.routes.find((route) => route.value.contribution.pageId === page.contributionId)?.value.contribution.path }));
  const resolved = codePluginUi.resolve("page", builtins.map(({ path, ...item }) => ({ ...item, ...(path === undefined ? {} : { path }) })));
  const pages: OwnedPageRegistration[] = [];
  const routes: OwnedRouteRegistration[] = [];
  const paths = new Set<string>();
  for (const value of resolved) {
    const old = snapshot.pages.find((page) => page.contributionId === value.id);
    const pageId = contributionIdSchema.parse(value.id);
    if (!old && (!value.Component || !value.path)) continue;
    const ownerId = old?.ownerId ?? extensionIdSchema.parse(codePluginUi.ownerOf(value.id));
    const module = { default: codePageComponent(value.id) };
    const runtime = { chunkId: value.id, exportName: "default", loading: "eager" as const, recovery: "none" as const, load: () => Promise.resolve(module), eagerModule: module };
    pages.push({ ownerId, contributionId: pageId, value: { kind: "page", contribution: pageContributionSchema.parse({ ...old?.value.contribution, id: value.id, title: value.title }), runtime } });
    const oldRoutes = snapshot.routes.filter((route) => route.value.contribution.pageId === value.id);
    if (oldRoutes.length > 0) {
      for (const route of oldRoutes) {
        const originalPath = builtins.find((item) => item.id === value.id)?.path;
        const path = value.path && route.value.contribution.path === originalPath ? value.path : route.value.contribution.path;
        if (paths.has(path)) continue;
        paths.add(path);
        routes.push({ ...route, value: { ...route.value, contribution: routeContributionSchema.parse({ ...route.value.contribution, path }) } });
      }
    } else {
      const path = value.path!;
      if (paths.has(path)) continue;
      paths.add(path);
      const route = routeContributionSchema.parse({ id: `${value.id}.route`, pageId, path, shell: "standard", persistent: false, prefetch: "none", projectContext: false, topbar: true, breadcrumbs: true, standaloneActions: false, mobileNavigation: true });
      routes.push({ ownerId, contributionId: route.id, value: { kind: "route", contribution: route, runtime: { boundary: "deferred-route", aliasBehavior: "render" } } });
    }
  }
  return { revision: snapshot.revision + codeRevision, pages, routes };
}
