import type { PluginDraftContent, PluginSurface } from "@wrapt/contracts";

type SurfacePatch = Pick<PluginDraftContent, "surfaces" | "wizard">;
type PluginRouteSource = Pick<PluginDraftContent, "routePath" | "slug" | "surfaces">;

export function pluginHostRoute(draft: PluginRouteSource): string {
  return draft.surfaces.includes("sidebar") ? `/plugins/tool/${draft.slug}` : draft.routePath;
}

function synchronizedSurfacePatch(
  draft: PluginDraftContent,
  selected: Iterable<PluginSurface>,
): SurfacePatch {
  const surfaces = [
    "page" as const,
    ...[...new Set(selected)].filter((surface) => surface !== "page"),
  ];
  return {
    surfaces,
    wizard: { ...draft.wizard, surfaces },
  };
}

export function togglePluginSurface(
  draft: PluginDraftContent,
  surface: PluginSurface,
): SurfacePatch {
  if (surface === "page") return synchronizedSurfacePatch(draft, draft.surfaces);
  const selected = new Set(draft.surfaces);
  if (selected.has(surface)) selected.delete(surface);
  else selected.add(surface);
  return synchronizedSurfacePatch(draft, selected);
}
