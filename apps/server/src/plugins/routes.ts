import {
  pluginDraftResponseSchema,
  pluginDraftsResponseSchema,
  pluginExamplesResponseSchema,
  pluginPublishResponseSchema,
  pluginActivationResponseSchema,
  pluginCreatorSkillResponseSchema,
  pluginValidationResponseSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PluginAuthoringService } from "./authoring.js";
import { readPluginCreatorSkill } from "./creator-skill.js";

const idParams = z.object({ id: z.string().min(1).max(64) });

export async function registerPluginRoutes(app: FastifyInstance, options: { authoring: PluginAuthoringService; creatorSkillPath: string }) {
  const authoring = options.authoring;
  await authoring.initialize();

  app.get("/plugins/examples", async () => {
    const examples = await authoring.listExamples();
    return pluginExamplesResponseSchema.parse({ examples, total: examples.length });
  });

  app.get("/plugins/drafts", async () => pluginDraftsResponseSchema.parse({ drafts: await authoring.listDrafts() }));

  app.get("/plugins/creator-skill", async () => pluginCreatorSkillResponseSchema.parse(await readPluginCreatorSkill(options.creatorSkillPath)));

  app.get("/plugins/drafts/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    return pluginDraftResponseSchema.parse({ draft: await authoring.getDraft(id) });
  });

  app.post("/plugins/drafts", async (request, reply) => {
    const draft = await authoring.createDraft(request.body);
    return reply.status(201).send(pluginDraftResponseSchema.parse({ draft }));
  });

  app.put("/plugins/drafts/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    return pluginDraftResponseSchema.parse({ draft: await authoring.updateDraft(id, request.body) });
  });

  app.delete("/plugins/drafts/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await authoring.deleteDraft(id);
    return reply.status(204).send();
  });

  app.post("/plugins/drafts/:id/publish", async (request) => {
    const { id } = idParams.parse(request.params);
    return pluginPublishResponseSchema.parse(await authoring.publishDraft(id));
  });
  app.post("/plugins/drafts/:id/validate", async (request) => {
    const { id } = idParams.parse(request.params);
    return pluginValidationResponseSchema.parse(await authoring.validateDraft(id));
  });
  app.post("/plugins/drafts/:id/activate", async (request) => {
    const { id } = idParams.parse(request.params);
    return pluginActivationResponseSchema.parse(await authoring.activateDraft(id));
  });
  app.post("/plugins/drafts/:id/deactivate", async (request) => {
    const { id } = idParams.parse(request.params);
    return pluginDraftResponseSchema.parse({ draft: await authoring.deactivateDraft(id) });
  });
}
