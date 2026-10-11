import {
  hermesSkillEditorCreateRequestSchema,
  skillEditorCreateRequestSchema,
  skillEditorDeleteRequestSchema,
  skillEditorGitCommitRequestSchema,
  skillEditorGitPreviewResponseSchema,
  skillEditorGitResponseSchema,
  skillEditorReadResponseSchema,
  skillEditorRenameRequestSchema,
  skillEditorScopeSchema,
  skillEditorStatusResponseSchema,
  skillEditorTreeResponseSchema,
  skillEditorWriteRequestSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteServices } from "../api/services.js";
import { requireWorkbenchAdmin } from "../security/workbench-identity.js";

// Werkzeug „KI-Skills": bearbeitet die globalen Agenten-Regeln und Skills direkt
// auf der Platte. Lesen bleibt für alle erlaubten Identitäten offen (Single-User-
// Betrieb ohne Mandantentrennung, siehe docs/hardening.md). Mutationen sind
// zusätzlich rate-limitiert und erfordern die Adminrolle, weil sie in echte
// Dateien und ins Skill-Repository schreiben.
export async function registerSkillsRoutes(app: FastifyInstance, services: RouteServices) {
  app.get("/skills/status", async () => skillEditorStatusResponseSchema.parse(await services.skillEditor.status()));
  app.get("/skills/tree", async () => skillEditorTreeResponseSchema.parse(await services.skillEditor.list()));
  app.get("/skills/file", async (request) => {
    const query = z.object({ path: z.string().trim().min(1).max(4_096) }).parse(request.query);
    return skillEditorReadResponseSchema.parse(await services.skillEditor.readFile({ path: query.path }));
  });
  app.put("/skills/file", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    const input = skillEditorWriteRequestSchema.parse(request.body);
    return skillEditorReadResponseSchema.parse(await services.skillEditor.writeFile(input));
  });
  app.post("/skills", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    requireWorkbenchAdmin(request, services.identity);
    const input = skillEditorCreateRequestSchema.parse(request.body);
    return reply.status(201).send(await services.skillEditor.createSkill(input));
  });
  app.post("/skills/hermes", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    requireWorkbenchAdmin(request, services.identity);
    const input = hermesSkillEditorCreateRequestSchema.parse(request.body);
    return reply.status(201).send(await services.skillEditor.createHermesSkill(input));
  });
  app.post("/skills/rename", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    const input = skillEditorRenameRequestSchema.parse(request.body);
    if (input.scope === "hermes") return services.skillEditor.renameHermesSkill(input);
    return services.skillEditor.renameSkill(input);
  });
  app.delete("/skills/:name", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    requireWorkbenchAdmin(request, services.identity);
    const { name } = skillEditorDeleteRequestSchema.parse(request.params);
    // Ohne ?scope= bleibt der Bestand ("skills") gültig — abwärtskompatibel.
    const { scope } = z.object({ scope: skillEditorScopeSchema.default("skills") }).parse(request.query);
    if (scope === "hermes") await services.skillEditor.deleteHermesSkill({ name });
    else await services.skillEditor.deleteSkill({ name });
    return reply.status(204).send();
  });
  app.get("/skills/git/preview", async () => skillEditorGitPreviewResponseSchema.parse(await services.skillEditor.gitPreview()));
  app.post("/skills/git/commit", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    const input = skillEditorGitCommitRequestSchema.parse(request.body);
    return skillEditorGitResponseSchema.parse(await services.skillEditor.gitCommit(input));
  });
  app.post("/skills/git/push", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    return skillEditorGitResponseSchema.parse(await services.skillEditor.gitPush());
  });
}
