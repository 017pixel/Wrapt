import type { PluginDraftContent, PluginSurface } from "@wrapt/contracts";

type SurfacePatch = Pick<PluginDraftContent, "orbit" | "surfaces" | "wizard">;
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
  const includeOrbit = surfaces.includes("orbit");
  return {
    surfaces,
    orbit: { ...draft.orbit, enabled: includeOrbit },
    wizard: { ...draft.wizard, surfaces, includeOrbit },
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

export function setPluginOrbitEnabled(
  draft: PluginDraftContent,
  enabled: boolean,
): SurfacePatch {
  const selected = new Set(draft.surfaces);
  if (enabled) selected.add("orbit");
  else selected.delete("orbit");
  return synchronizedSurfacePatch(draft, selected);
}
