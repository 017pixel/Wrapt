import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { localPluginSourceSchema, localPluginWriteSchema } from "@wrapt/extension-contracts";
import { requireWorkbenchAdmin, resolveWorkbenchUser, type WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import type { PluginCodePlatform } from "./code-platform.js";
import { registerCodePluginAssets } from "./code-assets.js";
import { pluginCodeTemplate } from "./code-template.js";
import { registerPluginDocs } from "./code-docs.js";

export async function registerCodePluginRoutes(app: FastifyInstance, options: { platform: PluginCodePlatform; identity: WorkbenchIdentityOptions }): Promise<void> {
  const { platform, identity } = options;
  const { sources, authoring, hub } = platform;
  const id = (request: FastifyRequest) => z.object({ id: z.string().min(1) }).parse(request.params).id;
  const admin = (request: FastifyRequest) => requireWorkbenchAdmin(request, identity);
  const context = (request: FastifyRequest) => ({ userId: resolveWorkbenchUser(request, identity), requestId: request.id, signal: new AbortController().signal });
  app.get("/plugins/api", async () => hub.describe());
  app.get("/plugins/runtime/code", async () => ({ safeMode: authoring.options.config.safeMode, plugins: platform.runtime.list().map((runtime) => ({
    id: runtime.slot.extensionId, version: runtime.slot.version, revision: runtime.slot.packageIntegrity, generation: runtime.pointer.runtimeId, description: runtime.description,
    ...(runtime.slot.manifest.entrypoints.ui ? { entrypoint: `/api/v1/plugins/code-assets/${runtime.slot.extensionId}/${runtime.slot.packageIntegrity}/${runtime.slot.manifest.entrypoints.ui.replace(/^\.\/client\//, "")}` } : {}),
  })) }));
  app.get("/plugins/code", async (request) => { admin(request); return { plugins: authoring.list() }; });
  app.post("/plugins/code", async (request, reply) => { admin(request); return reply.status(201).send(sources.create(localPluginWriteSchema.parse(request.body))); });
  app.post("/plugins/code/template", async (request) => { admin(request); const input = z.object({ id: z.string(), name: z.string().min(1).max(80) }).parse(request.body); return pluginCodeTemplate(input.id, input.name); });
  app.post("/plugins/code/scaffold", async (request, reply) => { admin(request); const input = z.object({ id: z.string(), name: z.string().min(1).max(80) }).parse(request.body); return reply.status(201).send(sources.create({ ...pluginCodeTemplate(input.id, input.name), expectedRevision: 0 })); });
  app.post("/plugins/code/register", async (request, reply) => { admin(request); return reply.status(201).send(sources.register(z.object({ directory: z.string().min(1) }).parse(request.body).directory)); });
  app.get("/plugins/code/:id/source", async (request) => { admin(request); return localPluginSourceSchema.parse(sources.source(id(request))); });
  app.put("/plugins/code/:id/source", async (request) => { admin(request); return sources.update(id(request), localPluginWriteSchema.parse(request.body)); });
  app.post("/plugins/code/:id/build", async (request) => { admin(request); return authoring.build(id(request)); });
  app.post("/plugins/code/:id/activate", async (request) => { admin(request); const input = z.object({ trust: z.boolean().default(false) }).parse(request.body ?? {}); return authoring.activate(id(request), input.trust); });
  app.post("/plugins/code/:id/actions", async (request) => {
    admin(request);
    const input = z.object({ action: z.enum(["enable", "disable", "reload", "rollback", "uninstall", "update"]), targetVersion: z.string().optional() }).parse(request.body);
    return authoring.action(id(request), input.action, input.targetVersion);
  });
  app.patch("/plugins/code/:id/development", async (request) => { admin(request); const input = z.object({ enabled: z.boolean() }).parse(request.body); sources.updateState(id(request), { development: input.enabled }); return { enabled: input.enabled }; });
  app.post("/plugins/code/:id/revoke-trust", async (request) => {
    admin(request); const pluginId = id(request);
    if (platform.runtime.get(pluginId)) await authoring.action(pluginId, "disable");
    sources.updateState(pluginId, { trusted: false });
    return { trusted: false };
  });
  app.delete("/plugins/code/:id", async (request, reply) => { admin(request); await authoring.remove(id(request)); return reply.status(204).send(); });
  app.get("/plugins/code/:id/inspector", async (request) => { admin(request); const pluginId = id(request); return { state: authoring.list().find((value) => value.id === pluginId), runtime: platform.runtime.get(pluginId)?.description ?? null, logs: hub.logEntries(pluginId), jobs: hub.jobs.history(pluginId) }; });
  app.post("/plugins/runtime/:id/rpc/:name", async (request) => { const params = z.object({ id: z.string(), name: z.string() }).parse(request.params); return { result: await hub.rpc(params.id, params.name, request.body, context(request)) }; });
  app.post("/plugins/host/:operation", async (request) => { const params = z.object({ operation: z.string() }).parse(request.params); return { result: await hub.callHost(params.operation, request.body, context(request)) }; });
  app.post("/plugins/commands/:name", async (request) => { const { name } = z.object({ name: z.string() }).parse(request.params); return { result: await hub.command(name, request.body, context(request)) }; });
  app.post("/plugins/resources/:name/:action", async (request) => { const { name, action } = z.object({ name: z.string(), action: z.enum(["list", "get", "create", "update", "remove"]) }).parse(request.params); return { result: await hub.resource(name, action, request.body, context(request)) }; });
  app.post("/plugins/services/:name/:method", async (request) => { const { name, method } = z.object({ name: z.string(), method: z.string() }).parse(request.params); return { result: await hub.service(name, method, request.body, context(request)) }; });
  app.post("/plugins/code/:id/jobs/:name", async (request) => { admin(request); const params = z.object({ id: z.string(), name: z.string() }).parse(request.params); return hub.jobs.run(params.id, params.name, { userId: context(request).userId, requestId: request.id }); });
  app.get("/plugins/events", async (request, reply) => {
    resolveWorkbenchUser(request, identity);
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    reply.raw.write(": connected\n\n");
    const unsubscribe = hub.subscribe((event) => { if (!reply.raw.writableEnded) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`); });
    const timer = setInterval(() => { reply.raw.write(": heartbeat\n\n"); }, 20_000);
    timer.unref();
    const close = () => { clearInterval(timer); unsubscribe(); };
    request.raw.on("close", close);
    reply.raw.on("close", close);
  });
  registerCodePluginAssets(app, platform);
  registerPluginDocs(app, authoring.options.repositoryRoot);
}
