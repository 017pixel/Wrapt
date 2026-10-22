import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { ExtensionDatabase } from "../extensions/database.js";
import { ExtensionManager } from "../extensions/manager.js";
import { LocalExtensionCatalog, defaultCatalogProviderId } from "../extensions/catalog.js";
import { ExtensionReleaseStore } from "../extensions/release-store.js";
import { ExtensionRuntimeHost } from "../extensions/runtime-host.js";
import { defaultPluginRuntimeConfig } from "../config/plugin-settings.js";
import { createPluginCodePlatform } from "./code-platform.js";
import { registerCodePluginRoutes } from "./code-routes.js";
import { registerNotesPluginApi } from "./host-notes.js";
import { registerNotesRoutes } from "../notes/routes.js";
import { NotesDatabase } from "../notes/database.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wrapt-code-publication-"));
  cleanup.push(async () => { rmSync(root, { recursive: true, force: true }); });
  const database = new ExtensionDatabase(join(root, "extensions.sqlite"));
  const releases = new ExtensionReleaseStore(join(root, "releases"));
  const pointers = new ExtensionRuntimeHost(join(root, "pointers"), releases);
  const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
  const manager = new ExtensionManager(database, undefined, releases, pointers);
  manager.attachCatalog(catalog); manager.attachLocalPluginCatalog(catalog);
  const platform = createPluginCodePlatform({ manager, database, releases, pointers, catalog }, { dataDirectory: root, repositoryRoot: resolve("../.."), config: { ...defaultPluginRuntimeConfig, shutdownTimeoutMs: 100 } });
  const notes = new NotesDatabase(join(root, "notes.sqlite"));
  registerNotesPluginApi(platform.api, notes);
  const app = Fastify();
  const identity = { allowedUsers: ["test"], adminUsers: ["test"], developmentUser: "test" };
  await app.register(registerCodePluginRoutes, { platform, identity });
  await registerNotesRoutes(app, { notes, identity, pluginHub: platform.hub });
  cleanup.push(async () => { await app.close(); await platform.close(); notes.close(); database.close(); });
  const post = (url: string, body?: unknown) => app.inject({ method: "POST", url, ...(body === undefined ? {} : { payload: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
  return { root, app, platform, notes, manager, post };
}

describe("Code-Plugin als lokaler Nutzerablauf", () => {
  it("baut das dokumentierte Projektjournal mit Hook, Job und öffentlichem Dienst", async () => {
    const f = await fixture();
    f.platform.api.register("projects.list", { description: "Testprojekte", mutates: false, hookable: true, handler: () => ({ projects: [] }) });
    const example = resolve("../../docs/extensions/plugin-platform/examples/project-journal");
    const definition = JSON.parse(readFileSync(join(example, "plugin.json"), "utf8"));
    const files = ["server.ts", "ui.tsx"].map(path => ({ path, content: readFileSync(join(example, path), "utf8") }));
    expect((await f.post("/plugins/code", { expectedRevision: 0, definition, files })).statusCode).toBe(201);
    const activation = await f.post("/plugins/code/personal.project-journal/activate", { trust: true });
    expect(activation.statusCode, activation.body).toBe(200);
    const task = (await f.post("/plugins/runtime/personal.project-journal/rpc/add", { title: "Dokumentation prüfen" })).json().result;
    expect(task.value.done).toBe(false);
    const toggle = await f.post("/plugins/runtime/personal.project-journal/rpc/toggle", { id: task.id, expectedRevision: task.revision });
    expect(toggle.json().result.value.done).toBe(true);
    expect((await f.post("/plugins/services/personal.project-journal:summary/count")).json().result).toBe(0);
    await f.post("/notes", { title: "Aus der Notiz" });
    expect((await f.post("/plugins/runtime/personal.project-journal/rpc/journal")).json().result).toMatchObject([{ value: { title: "Aus der Notiz" } }]);
    expect((await f.post("/plugins/code/personal.project-journal/jobs/collect")).statusCode).toBe(200);
    expect((await f.post("/plugins/runtime/personal.project-journal/rpc/snapshots")).json().result.length).toBeGreaterThan(0);
  }, 30_000);
  it("erstellt, prüft und aktiviert das echte Startprojekt mit persistenten RPC-Daten und Browser-Assets", async () => {
    const f = await fixture();
    expect((await f.post("/plugins/code/scaffold", { id: "personal.liste", name: "Meine Liste" })).statusCode).toBe(201);
    const built = await f.post("/plugins/code/personal.liste/build");
    expect(built.json().diagnostics).toEqual([]);
    expect(built.json().builtRevision).toBe(1);
    expect((await f.post("/plugins/code/personal.liste/activate")).statusCode).toBeGreaterThanOrEqual(400);
    const activation = await f.post("/plugins/code/personal.liste/activate", { trust: true });
    expect(activation.statusCode, activation.body).toBe(200);
    expect(activation.json().runtimeActive).toBe(true);
    expect((await f.post("/plugins/runtime/personal.liste/rpc/add", { title: "Bleibt erhalten" })).json().result.value.title).toBe("Bleibt erhalten");
    await f.post("/plugins/code/personal.liste/actions", { action: "disable" });
    await f.post("/plugins/code/personal.liste/actions", { action: "enable" });
    expect((await f.post("/plugins/runtime/personal.liste/rpc/list")).json().result).toHaveLength(1);
    const runtime = (await f.app.inject("/plugins/runtime/code")).json().plugins[0];
    const asset = await f.app.inject(runtime.entrypoint.replace("/api/v1", ""));
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain("/api/v1/plugins/sdk/react.js");
    expect(runtime).not.toHaveProperty("dataDirectory");
    expect((await f.app.inject(`/plugins/code-assets/personal.liste/wrong/ui.js`)).statusCode).toBe(404);
  }, 30_000);

  it("wendet Plugin-Hooks auf echte REST-Notizen an und blockiert Host-Mutationen während Setup", async () => {
    const f = await fixture();
    const definition = { formatVersion: 3, id: "personal.notizen", name: "Notizen", description: "Hook-Test", version: "0.1.0", server: "server.ts" };
    await f.post("/plugins/code", { expectedRevision: 0, definition, files: [{ path: "server.ts", content: `import { definePlugin } from "@wrapt/plugin-sdk";
export default definePlugin({ setup(ctx) {
  ctx.hooks.register("notes.create", "before", event => { event.input = { ...(event.input as object), title: "Vom Plugin geändert" }; });
} });` }] });
    const activation = await f.post("/plugins/code/personal.notizen/activate", { trust: true });
    expect(activation.statusCode, activation.body).toBe(200);
    const note = await f.post("/notes", { title: "Original" });
    expect(note.statusCode, note.body).toBe(201);
    expect(note.json().note.title).toBe("Vom Plugin geändert");
    const source = f.platform.sources.source("personal.notizen");
    f.platform.sources.update("personal.notizen", { expectedRevision: source.revision, definition, files: [{ path: "server.ts", content: `import { definePlugin } from "@wrapt/plugin-sdk";
export default definePlugin({ async setup(ctx) { await ctx.host.call("notes.create", { title: "Unerlaubter Setup-Schreibzugriff" }); } });` }] });
    expect((await f.post("/plugins/code/personal.notizen/activate")).statusCode).toBeGreaterThanOrEqual(400);
    expect(f.notes.list()).toHaveLength(1);
    expect(f.platform.runtime.get("personal.notizen")).toBeDefined();
  }, 30_000);
});
