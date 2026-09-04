import {
  pluginDraftResponseSchema,
  pluginDraftsResponseSchema,
  pluginExamplesResponseSchema,
  pluginPublishResponseSchema,
  pluginActivationResponseSchema,
  pluginCreatorSkillResponseSchema,
  pluginValidationResponseSchema,
  pluginDraftUpdateRequestSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireWorkbenchAdmin, type WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import type { PluginAuthoringService } from "./authoring.js";
import { readWraptPluginsSkill } from "./creator-skill.js";

const idParams = z.object({ id: z.string().min(1).max(64) });

export async function registerPluginRoutes(app: FastifyInstance, options: { authoring: PluginAuthoringService; creatorSkillPath: string; identity: WorkbenchIdentityOptions }) {
  const authoring = options.authoring;
  await authoring.initialize();
  const requireAdmin = (request: Parameters<typeof requireWorkbenchAdmin>[0]) => requireWorkbenchAdmin(request, options.identity);

  app.get("/plugins/examples", async () => {
    const examples = await authoring.listExamples();
    return pluginExamplesResponseSchema.parse({ examples, total: examples.length });
  });

  app.get("/plugins/drafts", async (request) => {
    requireAdmin(request);
    return pluginDraftsResponseSchema.parse({ drafts: await authoring.listDrafts() });
  });

  const readSkill = async () => pluginCreatorSkillResponseSchema.parse(await readWraptPluginsSkill(options.creatorSkillPath));
  app.get("/plugins/wrapt-plugins-skill", readSkill);
  app.get("/plugins/creator-skill", readSkill);

  app.get("/plugins/drafts/:id", async (request) => {
    requireAdmin(request);
    const { id } = idParams.parse(request.params);
    return pluginDraftResponseSchema.parse({ draft: await authoring.getDraft(id) });
  });

  app.post("/plugins/drafts", async (request, reply) => {
    requireAdmin(request);
    const draft = await authoring.createDraft(request.body);
    return reply.status(201).send(pluginDraftResponseSchema.parse({ draft }));
  });

  app.put("/plugins/drafts/:id", async (request) => {
    requireAdmin(request);
    const { id } = idParams.parse(request.params);
    const parsed = pluginDraftUpdateRequestSchema.parse(request.body);
    const content = "content" in parsed ? parsed.content : parsed;
    const expectedRevision = "content" in parsed ? parsed.expectedRevision : parsed.revision;
    return pluginDraftResponseSchema.parse({ draft: await authoring.updateDraft(id, content, expectedRevision) });
  });

  app.delete("/plugins/drafts/:id", async (request, reply) => {
    requireAdmin(request);
    const { id } = idParams.parse(request.params);
    await authoring.deleteDraft(id);
    return reply.status(204).send();
  });

  app.post("/plugins/drafts/:id/publish", async (request) => {
    requireAdmin(request);
    const { id } = idParams.parse(request.params);
    return pluginPublishResponseSchema.parse(await authoring.publishDraft(id));
  });
  app.post("/plugins/drafts/:id/validate", async (request) => {
    requireAdmin(request);
    const { id } = idParams.parse(request.params);
    return pluginValidationResponseSchema.parse(await authoring.validateDraft(id));
  });
  app.post("/plugins/drafts/:id/activate", async (request) => {
    requireAdmin(request);
    const { id } = idParams.parse(request.params);
    return pluginActivationResponseSchema.parse(await authoring.activateDraft(id));
  });
  app.post("/plugins/drafts/:id/deactivate", async (request) => {
    requireAdmin(request);
    const { id } = idParams.parse(request.params);
    return pluginDraftResponseSchema.parse({ draft: await authoring.deactivateDraft(id) });
  });
}
