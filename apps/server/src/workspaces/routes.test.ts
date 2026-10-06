import Fastify from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ZodError } from "zod";
import { afterEach, describe, expect, it } from "vitest";
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
