import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { RouteServices } from "../api/services.js";
import type { WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import { registerUsageRoutes } from "../usage/routes.js";
import { registerSystemRoutes } from "./routes.js";

// S-001–S-003: Non-Admin darf weder Restart/Update auslösen noch globale
// Accounts oder persistente Config (T3-Kanal, Monitoring, Appearance) ändern.
// Der Guard steht jeweils als erste Zeile im Handler — diese Tests lösen daher
// keine Seiteneffekte (kein Restart, kein Kanalwechsel, keine Dateiänderung) aus.
const identity: WorkbenchIdentityOptions = {
  allowedUsers: ["admin@example.com", "member@example.com"],
  adminUsers: ["admin@example.com"],
};

const memberHeaders = { "tailscale-user-login": "member@example.com" };

const apps: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function systemApp() {
  const app = Fastify();
  apps.push(app);
  await registerSystemRoutes(app, { identity } as unknown as RouteServices);
  return app;
}

async function usageApp() {
  const app = Fastify();
  apps.push(app);
  await registerUsageRoutes(app, { identity } as unknown as RouteServices);
  return app;
}

describe("Admin-Gates für System-Routen (S-001/S-003)", () => {
  const cases: Array<{ method: "POST" | "PUT"; url: string; payload: Record<string, unknown> }> = [
    { method: "POST", url: "/system/restart", payload: { target: "frontend" } },
    { method: "POST", url: "/system/update", payload: {} },
    { method: "POST", url: "/system/t3-channel", payload: { channel: "stable" } },
    { method: "PUT", url: "/system/usage-monitoring", payload: { monitoring: { enabled: true } } },
    { method: "PUT", url: "/system/appearance", payload: { theme: "dark" } },
    { method: "PUT", url: "/system/context-menu", payload: { contextMenu: { items: [] } } },
    { method: "PUT", url: "/system/mascot", payload: { mascot: { enabled: false } } },
  ];
  for (const { method, url, payload } of cases) {
    it(`blockiert ${method} ${url} für Non-Admin mit 403`, async () => {
      const app = await systemApp();
      const response = await app.inject({ method, url, headers: memberHeaders, payload });
      expect(response.statusCode).toBe(403);
    });
  }
});

describe("Admin-Gates für Account-Switch (S-002)", () => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  it("blockiert POST /accounts/:id/activate für Non-Admin mit 403", async () => {
    const app = await usageApp();
    const response = await app.inject({ method: "POST", url: `/accounts/${accountId}/activate`, headers: memberHeaders });
    expect(response.statusCode).toBe(403);
  });
  it("blockiert POST /accounts/login-session für Non-Admin mit 403", async () => {
    const app = await usageApp();
    const response = await app.inject({ method: "POST", url: "/accounts/login-session", headers: memberHeaders, payload: {} });
    expect(response.statusCode).toBe(403);
  });
  it("blockiert DELETE /accounts/:id für Non-Admin mit 403", async () => {
    const app = await usageApp();
    const response = await app.inject({ method: "DELETE", url: `/accounts/${accountId}`, headers: memberHeaders });
    expect(response.statusCode).toBe(403);
  });
});
