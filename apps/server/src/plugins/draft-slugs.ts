import type { PluginDraftContent } from "@wrapt/contracts";

function suffixedSlug(base: string, index: number): string {
  const suffix = `-${index}`;
  return `${base.slice(0, 48 - suffix.length).replace(/-+$/, "")}${suffix}`;
}

export function nextAvailablePluginSlug(base: string, occupied: ReadonlySet<string>): string {
  if (!occupied.has(base)) return base;
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = suffixedSlug(base, index);
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error("Für diesen Plugin-Namen konnte keine freie Slug ermittelt werden.");
}

export function replaceGeneratedPluginSlug(content: PluginDraftContent, slug: string): PluginDraftContent {
  if (content.slug === slug) return content;
  const generatedViewPath = `/plugins/view/${content.slug}`;
  const generatedToolPath = `/plugins/tool/${content.slug}`;
  const routePath = content.routePath === generatedViewPath
    ? `/plugins/view/${slug}`
    : content.routePath === generatedToolPath
      ? `/plugins/tool/${slug}`
      : content.routePath;
  return { ...content, slug, routePath };
}
