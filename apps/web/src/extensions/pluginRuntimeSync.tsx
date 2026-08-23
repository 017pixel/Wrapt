import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { navigationContributionSchema, pageContributionSchema, routeContributionSchema } from "@wrapt/extension-contracts";
import { resolvePluginIcon } from "../components/plugins/pluginIcons";
import { createPluginToolPage } from "../views/PluginRuntime";
import { wraptQueries } from "../lib/queryOptions";
import { navigationRegistry } from "./navigationRegistry";
import { pageRouteRegistry } from "./pageRouteRegistry";
import { pluginRuntimeOwnerId, pluginToolRoutePath, resolveActivePluginContents } from "./pluginRuntime";

function registerToolPage(slug: string, name: string, description: string, icon: string): void {
  const ownerId = pluginRuntimeOwnerId(slug);
  const pageId = `${ownerId}.page.main`;
  const routeId = `${ownerId}.route.main`;
  const ToolPage = createPluginToolPage(slug);
  const module = Object.freeze({ PluginToolPage: ToolPage });
  const page = pageContributionSchema.parse({ id: pageId, title: name, description });
  const route = routeContributionSchema.parse({
    id: routeId,
    pageId,
    path: pluginToolRoutePath(slug),
    shell: "standard",
    persistent: true,
    prefetch: "idle",
    projectContext: false,
    topbar: true,
    breadcrumbs: true,
    standaloneActions: false,
    mobileNavigation: true,
  });
  pageRouteRegistry.replaceOwner(ownerId, {
    pages: [{ contribution: page, runtime: {
      chunkId: `plugin-${slug}`,
      exportName: "PluginToolPage",
      loading: "eager",
      recovery: "none",
      load: () => Promise.resolve(module),
      eagerModule: module,
    } }],
    routes: [{ contribution: route, runtime: {
      boundary: "deferred-route",
      aliasBehavior: "render",
      prefetchPathPrefix: pluginToolRoutePath(slug),
    } }],
  });
  navigationRegistry.replaceOwner(ownerId, [{
    contribution: navigationContributionSchema.parse({
      id: `${ownerId}.navigation.main`,
      routeId,
      label: name,
      description,
      icon: "extension",
      group: "tools",
      order: 500,
      visibleByDefault: true,
    }),
    runtime: { icon: resolvePluginIcon(icon) },
  }]);
}

export function PluginRuntimeSync() {
  const drafts = useQuery(wraptQueries.pluginDrafts());
  const examples = useQuery(wraptQueries.pluginExamples());
  const registry = useQuery(wraptQueries.extensionRegistry());
  const active = useMemo(() => resolveActivePluginContents(
    drafts.data?.drafts ?? [],
    examples.data?.examples ?? [],
    registry.data?.extensions ?? [],
  ).filter((item) => item.content.surfaces.includes("sidebar")), [
    drafts.data?.drafts,
    examples.data?.examples,
    registry.data?.extensions,
  ]);
  const signature = active.map((item) => `${item.extensionId}:${item.content.slug}:${item.content.name}:${item.content.description}:${item.content.icon}`).join("|");

  useEffect(() => {
    const activeOwners = new Set<string>();
    for (const item of active) {
      const ownerId = pluginRuntimeOwnerId(item.content.slug);
      activeOwners.add(ownerId);
      try {
        registerToolPage(item.content.slug, item.content.name, item.content.description, item.content.icon);
      } catch {
        pageRouteRegistry.removeOwner(ownerId);
        navigationRegistry.removeOwner(ownerId);
      }
    }
    for (const owner of pageRouteRegistry.getSnapshot().pages.map((item) => item.ownerId)) {
      if (owner.startsWith("wrapt.plugin.") && !activeOwners.has(owner)) {
        pageRouteRegistry.removeOwner(owner);
        navigationRegistry.removeOwner(owner);
      }
    }
  }, [active, signature]);

  return null;
}
