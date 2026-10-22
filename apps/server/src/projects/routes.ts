import {
  createProjectFileRequestSchema,
  projectActivityTouchResponseSchema,
  projectFileResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  registerProjectRequestSchema,
  registerProjectResponseSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteServices } from "../api/services.js";

import { pluginRouteOperation } from "../plugins/host-route.js";

const projectParamsSchema = z.object({ projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

export async function registerProjectRoutes(app: FastifyInstance, services: RouteServices) {
  app.get("/projects", async (request) => pluginRouteOperation(services, request, "projects.list", undefined, () => services.projects.list()).then((value) => projectsResponseSchema.parse(value)));
  app.post("/projects/register", async (request, reply) => {
    const input = registerProjectRequestSchema.parse(request.body);
    const result = registerProjectResponseSchema.parse(await pluginRouteOperation(services, request, "projects.register", input, async () => services.projects.register(await services.projectBrowser.resolveDirectory(input.path, false))));
    return reply.status(result.created ? 201 : 200).send(result);
  });
  app.get("/projects/:projectId", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return projectResponseSchema.parse(await pluginRouteOperation(services, request, "projects.get", { projectId }, () => services.projects.get(projectId)));
  });
  app.post("/projects/:projectId/activity", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return projectActivityTouchResponseSchema.parse(await pluginRouteOperation(services, request, "projects.touch", { projectId }, () => services.projects.touch(projectId)));
  });
  app.post("/projects/:projectId/files", async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const file = createProjectFileRequestSchema.parse(request.body);
    const result = await pluginRouteOperation(services, request, "projects.createFile", { projectId, file }, () => services.projectFiles.create(projectId, file));
    return reply.status(result.created ? 201 : 200).send(projectFileResponseSchema.parse(result));
  });
}
