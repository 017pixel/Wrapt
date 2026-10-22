import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import { UiSettingsDatabase } from "./database.js";
import { settingsEvents, type SettingsEventMessage } from "./events.js";
import { registerUiSettingsRoutes } from "./routes.js";

const identity: WorkbenchIdentityOptions = {
  allowedUsers: ["a@example.com", "b@example.com"],
};

const apps: Array<{ close: () => Promise<void> }> = [];
const databases: UiSettingsDatabase[] = [];
const directories: string[] = [];

function createDatabase(): UiSettingsDatabase {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-ui-settings-routes-"));
  directories.push(directory);
  const database = new UiSettingsDatabase(join(directory, "wrapt.sqlite"));
  databases.push(database);
  return database;
}

async function createApp(database: UiSettingsDatabase) {
  const app = Fastify();
  await registerUiSettingsRoutes(app, { database, identity });
  apps.push(app);
  return app;
}

const asA = { "tailscale-user-login": "a@example.com" };
const asB = { "tailscale-user-login": "b@example.com" };

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Einstellungs-Routen", () => {
  it("liefert ein leeres Dokument und speichert Änderungen", async () => {
    const app = await createApp(createDatabase());
    const empty = await app.inject({ method: "GET", url: "/settings/ui", headers: asA });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({ revision: 0, entries: {} });

    const saved = await app.inject({
      method: "PUT",
      url: "/settings/ui",
      headers: asA,
      payload: {
        clientId: "client-a",
        changes: [{ key: "appPreferences", value: { state: { defaultPage: "usage" }, version: 2 } }],
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ revision: 1 });

    const current = await app.inject({ method: "GET", url: "/settings/ui", headers: asA });
    expect(current.json()).toMatchObject({
      revision: 1,
      entries: { appPreferences: { value: { state: { defaultPage: "usage" }, version: 2 } } },
    });
  });

  it("trennt die Einstellungen nach Workbench-Identität", async () => {
    const app = await createApp(createDatabase());
    await app.inject({
      method: "PUT",
      url: "/settings/ui",
      headers: asA,
      payload: { clientId: "client-a", changes: [{ key: "overlayTransparency", value: 50 }] },
    });
    const other = await app.inject({ method: "GET", url: "/settings/ui", headers: asB });
    expect(other.json()).toMatchObject({ entries: {} });
  });

  it("meldet geänderte Schlüssel an verbundene Clients", async () => {
    const app = await createApp(createDatabase());
    const events: SettingsEventMessage[] = [];
    const unsubscribe = settingsEvents.subscribe((event) => events.push(event));
    try {
      await app.inject({
        method: "PUT",
        url: "/settings/ui",
        headers: asA,
        payload: {
          clientId: "client-a",
          changes: [
            { key: "overlayTransparency", value: 120 },
            { key: "appPreferences", value: { state: {}, version: 2 } },
          ],
        },
      });
    } finally {
      unsubscribe();
    }
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toMatchObject({
      type: "ui-settings.updated",
      ownerId: "a@example.com",
      clientId: "client-a",
      revision: 1,
    });
    if (event?.type === "ui-settings.updated") {
      expect(Object.keys(event.entries).sort()).toEqual(["appPreferences", "overlayTransparency"]);
    }
  });
});
