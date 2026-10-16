import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ZodError } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { settings } from "../config/settings.js";
import { WorkspaceRegistryDatabase } from "./database.js";
import { registerWorkspaceRegistryRoutes } from "./routes.js";
import { AppError } from "../utils/errors.js";

const apps: ReturnType<typeof Fastify>[] = [];
const directories: string[] = [];
const databases: WorkspaceRegistryDatabase[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  databases.splice(0).forEach((database) => database.close());
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-workspaces-"));
  directories.push(directory);
  const database = new WorkspaceRegistryDatabase(join(directory, "wrapt.sqlite"));
  databases.push(database);
  const app = Fastify();
  apps.push(app);
  // Fehlerformat wie im echten Server (registerCoreHooks).
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "Die Anfrage ist ungültig." } });
    }
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Die Anfrage konnte nicht verarbeitet werden." } });
  });
  await app.register(registerWorkspaceRegistryRoutes, {
    prefix: "/api/v1",
    database,
    identity: { allowedUsers: ["macbook@example.com", "pc@example.com"] },
  });
  await app.ready();
  return app;
}

const headers = { "tailscale-user-login": "macbook@example.com" };
const entry = {
  id: "zweitserver",
  name: "Zweitserver",
  url: "https://zweit.example:8443",
  addedAt: "2026-10-01T10:00:00.000Z",
  lastUsedAt: null,
};
const document = { entries: [entry], changedAt: {}, deletedAt: {} };

describe("Workspace-Register-Routen", () => {
  it("verlangt eine Workbench-Identität", async () => {
    const app = await setup();
    expect((await app.inject({ method: "GET", url: "/api/v1/workspaces/registry" })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: "/api/v1/workspaces/registry", payload: { document, expectedRevision: 0 } })).statusCode).toBe(401);
  });

  it("liefert ein leeres Register und speichert per Revision", async () => {
    const app = await setup();
    const empty = await app.inject({ method: "GET", url: "/api/v1/workspaces/registry", headers });
    expect(empty.json()).toMatchObject({ document: { entries: [] }, revision: 0 });

    const saved = await app.inject({ method: "PUT", url: "/api/v1/workspaces/registry", headers, payload: { document, expectedRevision: 0 } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ revision: 1, document: { entries: [entry] } });

    const reloaded = await app.inject({ method: "GET", url: "/api/v1/workspaces/registry", headers });
    expect(reloaded.json()).toMatchObject({ revision: 1, document: { entries: [{ ...entry, url: "https://zweit.example:8443" }] } });
  });

  it("meldet einen Konflikt bei veralteter Revision", async () => {
    const app = await setup();
    await app.inject({ method: "PUT", url: "/api/v1/workspaces/registry", headers, payload: { document, expectedRevision: 0 } });
    const conflict = await app.inject({ method: "PUT", url: "/api/v1/workspaces/registry", headers, payload: { document, expectedRevision: 0 } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: { code: "WORKSPACE_REGISTRY_CONFLICT" } });
  });

  it("trennt Register strikt pro Benutzer", async () => {
    const app = await setup();
    await app.inject({ method: "PUT", url: "/api/v1/workspaces/registry", headers, payload: { document, expectedRevision: 0 } });
    const other = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces/registry",
      headers: { "tailscale-user-login": "pc@example.com" },
    });
    expect(other.json()).toMatchObject({ document: { entries: [] }, revision: 0 });
  });

  it("lehnt ungültige Dokumente ab", async () => {
    const app = await setup();
    const bad = await app.inject({
      method: "PUT",
      url: "/api/v1/workspaces/registry",
      headers,
      payload: { document: { entries: [{ ...entry, url: "javascript:alert(1)" }], changedAt: {}, deletedAt: {} }, expectedRevision: 0 },
    });
    expect(bad.statusCode).toBe(400);
  });
});

async function startTarget(handler: (request: FastifyRequest, reply: FastifyReply) => unknown) {
  const target = Fastify();
  apps.push(target);
  target.get("/api/v1/health", handler as never);
  const origin = await target.listen({ host: "127.0.0.1", port: 0 });
  return origin;
}

describe("Workspace-Probe-Route", () => {
  it("verlangt eine Workbench-Identität und gültige URLs", async () => {
    const app = await setup();
    const unauthorized = await app.inject({ method: "POST", url: "/api/v1/workspaces/probe", payload: { url: "https://zweit.example:8443" } });
    expect(unauthorized.statusCode).toBe(401);
    const invalid = await app.inject({ method: "POST", url: "/api/v1/workspaces/probe", headers, payload: { url: "javascript:alert(1)" } });
    expect(invalid.statusCode).toBe(400);
  });

  it("liest den Health des Zielservers serverseitig und meldet Live", async () => {
    const target = await startTarget(() => ({
      status: "ok",
      version: settings.appVersion,
      appName: "Wrapt",
      instanceName: "Zweitserver",
      timestamp: new Date().toISOString(),
      bootId: "boot-zweit",
      webBuildId: null,
    }));
    const app = await setup();
    const response = await app.inject({ method: "POST", url: "/api/v1/workspaces/probe", headers, payload: { url: target } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "live", reachable: true, version: settings.appVersion, instanceName: "Zweitserver", appName: "Wrapt", bootId: "boot-zweit" });
  });

  it("meldet andere Release-Linien als inkompatibel", async () => {
    const target = await startTarget(() => ({
      status: "ok",
      version: "0.1.0",
      appName: "Wrapt",
      instanceName: "Altserver",
      timestamp: new Date().toISOString(),
      bootId: "boot-alt",
      webBuildId: null,
    }));
    const app = await setup();
    const response = await app.inject({ method: "POST", url: "/api/v1/workspaces/probe", headers, payload: { url: target } });
    expect(response.json()).toMatchObject({ status: "incompatible", reachable: true, version: "0.1.0" });
  });

  it("verweigert Klartext-HTTP zu fremden Hosts ohne Netzwerkzugriff", async () => {
    const app = await setup();
    const response = await app.inject({ method: "POST", url: "/api/v1/workspaces/probe", headers, payload: { url: "http://10.255.255.1:8080" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "offline", reachable: false });
  });
});
