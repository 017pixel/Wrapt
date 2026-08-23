import type { PluginDraft, PluginDraftContent } from "@wrapt/contracts";

export function contentOf(draft: PluginDraft): PluginDraftContent {
  const content: Partial<PluginDraft> = { ...draft };
  delete content.id;
  delete content.createdAt;
  delete content.updatedAt;
  return content as PluginDraftContent;
}
