import type { ExtensionRegistrySummary } from "@wrapt/extension-contracts";
import type { PluginDraft, PluginDraftContent, PluginExample } from "@wrapt/contracts";

export interface ActivePluginContent {
  readonly extensionId: string;
  readonly content: PluginDraftContent;
}

type RegistryState = Pick<ExtensionRegistrySummary, "id" | "lifecycle">;

function normalizedSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "") || "plugin";
}

export function pluginRuntimeOwnerId(slug: string): string {
  return `wrapt.plugin.${normalizedSlug(slug)}`;
}

export function pluginToolRoutePath(slug: string): string {
  return `/plugins/tool/${normalizedSlug(slug)}`;
}

/** Ermittelt nur aktive Inhalte. Ein gleichnamiger lokaler Draft gewinnt gegen ein Beispiel. */
export function resolveActivePluginContents(
  drafts: readonly PluginDraft[],
  examples: readonly PluginExample[],
  registry: readonly RegistryState[],
): ActivePluginContent[] {
  const result = new Map<string, ActivePluginContent>();
  const localSlugs = new Set(drafts.map((draft) => draft.slug));
  const newestDrafts = [...drafts].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
  for (const draft of newestDrafts) {
    if (draft.activationStatus !== "active") continue;
    if (result.has(draft.slug)) continue;
    result.set(draft.slug, { extensionId: `wrapt.local.${draft.slug}`, content: draft });
  }

  const examplesBySlug = new Map(examples.map((example) => [example.slug, example]));
  for (const entry of registry) {
    if (entry.lifecycle !== "active" || !entry.id.startsWith("wrapt.example.")) continue;
    const slug = entry.id.slice("wrapt.example.".length);
    const example = examplesBySlug.get(slug);
    if (example !== undefined && !localSlugs.has(slug) && !result.has(slug)) result.set(slug, { extensionId: entry.id, content: example });
  }
  return [...result.values()].sort((left, right) => left.content.name.localeCompare(right.content.name, "de"));
}

export function findActivePluginContent(
  slug: string | undefined,
  drafts: readonly PluginDraft[],
  examples: readonly PluginExample[],
  registry: readonly RegistryState[],
): ActivePluginContent | undefined {
  if (!slug) return undefined;
  return resolveActivePluginContents(drafts, examples, registry).find((item) => item.content.slug === slug);
}
