import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { personaStorage, seedPersona, type PersonaName } from "./persona-seeds";
import { getJson, identity, putJson, startWorkerServer } from "./server";

export { setupFrisch, setupNormal, setupHeavy, setupKonfiguriert } from "./persona-seeds";
export { expect } from "@playwright/test";

type WorkerState = Awaited<ReturnType<typeof startWorkerServer>> & {
  notes: { id: string; title: string }[];
  snapshots: Record<string, unknown>;
};
type WorkerFixtures = { personaName: PersonaName; workerState: WorkerState };
type Fixtures = {
  api: APIRequestContext;
  seededNotes: WorkerState["notes"];
  appErrors: string[];
  restoreServer: void;
};

const settingPaths = {
  "/system/appearance": "theme", "/system/mascot": null,
  "/system/context-menu": null, "/system/usage-monitoring": null,
  "/notifications/settings": "preferences", "/system/t3-channel": "configuredChannel",
} as const;

function clearUiSettings(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("DELETE FROM ui_settings");
  } finally { database.close(); }
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  personaName: ["normal", { option: true, scope: "worker" }],
  workerState: [async ({ personaName }, use, workerInfo) => {
    const server = await startWorkerServer(workerInfo.workerIndex);
    try {
      const notes = await seedPersona(server.api, personaName);
      const snapshots: Record<string, unknown> = {};
      for (const [path, key] of Object.entries(settingPaths)) {
        const value = await getJson(server.api, path);
        snapshots[path] = key ? path === "/system/t3-channel" ? { channel: value[key] } : value[key] : value;
      }
      snapshots["/workspaces/registry"] = (await getJson(server.api, "/workspaces/registry")).document;
      await use({ ...server, notes, snapshots });
    } finally { await server.stop(); }
  }, { scope: "worker", timeout: 60_000 }],
  baseURL: async ({ workerState }, use) => use(workerState.origin),
  extraHTTPHeaders: identity,
  storageState: async ({ personaName, workerState }, use) => use(personaStorage(personaName, workerState.origin)),
  api: async ({ workerState }, use) => use(workerState.api),
  seededNotes: async ({ workerState }, use) => use(workerState.notes),
  appErrors: [async ({ page }, use, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        const url = message.location().url;
        errors.push(url ? `${message.text()} (${url})` : message.text());
      }
    });
    await use(errors);
    await testInfo.attach("browser-errors", { body: JSON.stringify(errors, null, 2), contentType: "application/json" });
  }, { auto: true }],
  restoreServer: [async ({ workerState, context }, use) => {
    // Ein verspäteter Settings-PUT aus dem vorherigen Kontext darf den neuen
    // Test nicht mehr erreichen.
    clearUiSettings(workerState.databasePath);
    await use();
    // Erst alle Tabs schließen, damit Autosave keine Rücksetzung überschreibt.
    await context.close();
    const { api, notes, snapshots } = workerState;
    const current = await getJson(api, "/notes");
    const seedIds = new Set(notes.map((note) => note.id));
    const database = new DatabaseSync(workerState.databasePath);
    try {
      database.exec("PRAGMA busy_timeout = 5000");
      // Serverweite UI-Einstellungen (Start-App, Seitenleiste, Layout) gehören
      // zum Testzustand. Die Tabelle ist beim Worker-Start leer; ein Test darf
      // seinen geänderten Stand nicht in den nächsten tragen.
      database.exec("DELETE FROM ui_settings");
      const remove = database.prepare("DELETE FROM notes WHERE id = ?");
      for (const note of current.notes) if (!seedIds.has(note.id)) remove.run(note.id);
    } finally { database.close(); }
    for (const [path, data] of Object.entries(snapshots)) {
      if (path === "/workspaces/registry") {
        const { revision } = await getJson(api, path);
        await putJson(api, path, { expectedRevision: revision, document: data });
      } else if (path === "/system/t3-channel") {
        await expect(await api.post(`/api/v1${path}`, { data })).toBeOK();
      } else await putJson(api, path, data);
    }
  }, { auto: true }],
});
