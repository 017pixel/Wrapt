import {
  pluginDraftResponseSchema,
  pluginDraftsResponseSchema,
  pluginExamplesResponseSchema,
  pluginPublishResponseSchema,
  pluginActivationResponseSchema,
  pluginCreatorSkillResponseSchema,
  pluginValidationResponseSchema,
  type PluginDraftContent,
} from "@wrapt/contracts";
import { mutate, request } from "./transport.js";

export const pluginsApi = {
  pluginExamples: (signal?: AbortSignal) => request("/plugins/examples", pluginExamplesResponseSchema, signal),
  pluginDrafts: (signal?: AbortSignal) => request("/plugins/drafts", pluginDraftsResponseSchema, signal),
  pluginCreatorSkill: (signal?: AbortSignal) => request("/plugins/creator-skill", pluginCreatorSkillResponseSchema, signal),
  pluginDraft: (id: string, signal?: AbortSignal) => request(`/plugins/drafts/${encodeURIComponent(id)}`, pluginDraftResponseSchema, signal),
  createPluginDraft: (body: PluginDraftContent) => mutate("/plugins/drafts", "POST", pluginDraftResponseSchema, body),
  updatePluginDraft: (id: string, body: PluginDraftContent) => mutate(`/plugins/drafts/${encodeURIComponent(id)}`, "PUT", pluginDraftResponseSchema, body),
  deletePluginDraft: (id: string) => mutate(`/plugins/drafts/${encodeURIComponent(id)}`, "DELETE", null),
  publishPluginDraft: (id: string) => mutate(`/plugins/drafts/${encodeURIComponent(id)}/publish`, "POST", pluginPublishResponseSchema),
  validatePluginDraft: (id: string) => mutate(`/plugins/drafts/${encodeURIComponent(id)}/validate`, "POST", pluginValidationResponseSchema),
  activatePluginDraft: (id: string) => mutate(`/plugins/drafts/${encodeURIComponent(id)}/activate`, "POST", pluginActivationResponseSchema),
  deactivatePluginDraft: (id: string) => mutate(`/plugins/drafts/${encodeURIComponent(id)}/deactivate`, "POST", pluginDraftResponseSchema),
};
