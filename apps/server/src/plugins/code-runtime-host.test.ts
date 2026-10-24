import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extensionManifestV1Schema, semanticVersionSchema, type ExtensionManagementRequest } from "@wrapt/extension-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PluginHostApi } from "./code-host-api.js";
import { PluginRuntimeHub } from "./code-runtime-hub.js";
import { defaultPluginRuntimeConfig } from "../config/plugin-settings.js";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "../extensions/catalog.js";
import { ExtensionDatabase } from "../extensions/database.js";
import { ExtensionManager } from "../extensions/manager.js";
import { ExtensionReleaseStore } from "../extensions/release-store.js";
import { ExtensionRuntimeHost } from "../extensions/runtime-host.js";
import { PluginCodeSourceStore } from "./code-source-store.js";
import { PluginCodeRuntimeHost } from "./code-runtime-host.js";

const fixtures: { root: string; close(): Promise<void> }[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) { await fixture.close(); rmSync(fixture.root, { recursive: true, force: true }); } });

function fixture(options: { id?: string; timeoutMs?: number; handle?: (id: string, method: string, input: unknown) => unknown | Promise<unknown>; changed?: () => void } = {}) {
  const pluginId = options.id ?? "personal.tasks";
  const cleanup: Array<() => Promise<void>> = [];
  const root = mkdtempSync(join(tmpdir(), "wrapt-code-runtime-"));
  const sources = new PluginCodeSourceStore(join(root, "sources"));
  sources.create({ expectedRevision: 0, definition: { formatVersion: 3, id: pluginId, name: "Aufgaben", description: "Meine Aufgaben", version: "0.1.0", server: "server.ts" }, files: [{ path: "server.ts", content: "export default { setup() {} };" }] });
  const catalogRoot = join(root, "catalog");
  const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
  catalog.addSourceDirectory(catalogRoot, { effectiveTrust: "developer" });
  const releases = new ExtensionReleaseStore(join(root, "releases"));
  const pointers = new ExtensionRuntimeHost(join(root, "pointers"), releases);
  const database = new ExtensionDatabase(join(root, "extensions.sqlite"));
  const manager = new ExtensionManager(database, undefined, releases, pointers);
  const host = new PluginCodeRuntimeHost({ sources, catalog, releases, pointers, dataDirectory: join(root, "runtime-data"), config: { ...defaultPluginRuntimeConfig, requestTimeoutMs: options.timeoutMs ?? defaultPluginRuntimeConfig.requestTimeoutMs, shutdownTimeoutMs: 100 }, handle: options.handle ?? (() => null), ...(options.changed ? { changed: options.changed } : {}) });
  manager.attachCatalog(catalog);
  manager.attachLocalPluginCatalog(catalog);
  manager.attachExecutableRuntime(host);
  const close = async () => { await host.close(); for (const finish of cleanup) await finish(); database.close(); };
  fixtures.push({ root, close });
  const publish = (version: string, code: string) => {
    const directory = join(catalogRoot, pluginId);
    mkdirSync(directory, { recursive: true });
    const manifest = extensionManifestV1Schema.parse({ manifestVersion: 1, id: pluginId, name: "Aufgaben", description: "Meine Aufgaben", version, publisher: "personal", license: "UNLICENSED", trust: "developer", engines: { wrapt: ">=2.17.0", extensionApi: ">=1.0.0" }, entrypoints: { server: "./server.js" }, permissions: [], activationEvents: [], contributes: {} });
    writeFileSync(join(directory, "extension.json"), JSON.stringify(manifest));
    writeFileSync(join(directory, "plugin-code.json"), '{"formatVersion":3}');
    writeFileSync(join(directory, "package.json"), '{"type":"module"}');
    writeFileSync(join(directory, "server.js"), code);
    catalog.refresh();
    const entry = catalog.get(manifest.id)!;
    const source = { kind: "developer" as const, registrationId: sources.metadata(manifest.id).registrationId, packageIntegrity: entry.package.integrity };
    manager.registerDiscovered(manifest, source);
    return { source, entry, manifest };
  };
  const install = async () => {
    const entry = catalog.get(pluginId)!;
    return manager.dispatch({ operation: "install", extensionId: entry.manifest.id, expectedRevision: database.revision(), source: { kind: "developer", registrationId: sources.metadata(entry.manifest.id).registrationId, packageIntegrity: entry.package.integrity }, enableAfterInstall: true });
  };
  const update = async () => {
    catalog.refresh();
    manager.syncCatalogUpdates();
    const entry = catalog.get(pluginId)!;
    return manager.dispatch({ operation: "update", extensionId: entry.manifest.id, expectedRevision: database.revision(), target: { providerId: entry.providerId, catalogRevision: catalog.revision(), version: entry.package.version, packageIntegrity: entry.package.integrity } } as ExtensionManagementRequest);
  };
  const rpc = <T = unknown>(name: string, input?: unknown) => host.get(pluginId)!.process.call<T>("rpc", { name, input, request: { userId: "demo", requestId: "test" } });
  return { root, cleanup, sources, catalog, releases, pointers, database, manager, host, publish, install, update, rpc };
}

const initial = `export default { async setup(ctx) {
  await ctx.storage.migrate(1, async storage => { await storage.set('count', 1); });
  ctx.rpc.register('read', { handler() { return ctx.storage.get('count'); } });
  ctx.rpc.register('write', { handler(value) { return ctx.storage.set('count', value); } });
} };`;

// Diese Integrationstests starten bei Versionswechseln mehrere echte Node-Prozesse.
describe("Code-Plugins über den Extension-Manager", { timeout: 20_000 }, () => {
  it("speichert vorbereiteten Zustand vor dem Snapshot und meldet verspätete Cleanup-Schreibzugriffe", async () => {
    const logs: string[] = [];
    const service = fixture({ handle: (_id, method, raw) => { if (method === "log") logs.push(JSON.stringify(raw)); return null; } });
    service.sources.updateState("personal.tasks", { trusted: true });
    service.publish("0.1.0", `export default { setup(ctx) {
      ctx.lifecycle.beforeSnapshot(() => ctx.storage.set('saved', 'vor Snapshot'));
      ctx.effect(() => ctx.storage.set('saved', 'zu spät'));
      ctx.rpc.register('read', { handler() { return ctx.storage.get('saved'); } });
    } };`);
    await service.install();
    service.publish("0.2.0", `export default { setup(ctx) { ctx.rpc.register('read', { handler() { return ctx.storage.get('saved'); } }); } };`);
    await service.update();
    expect(await service.rpc("read")).toBe("vor Snapshot");
    await expect.poll(() => logs.some((entry) => entry.includes("beforeSnapshot"))).toBe(true);
  });
  it("kann nach einem Timeout während Freeze wieder deaktiviert und gestartet werden", async () => {
    const service = fixture();
    service.sources.updateState("personal.tasks", { trusted: true });
    service.publish("0.1.0", initial.replace("ctx.rpc.register('read'", "ctx.rpc.register('hang', { handler() { return new Promise(() => {}); } }); ctx.rpc.register('read'"));
    await service.install();
    await service.rpc("write", 17);
    const process = service.host.get("personal.tasks")!.process;
    const call = process.call.bind(process);
    const hung = call("rpc", { name: "hang", request: { userId: "demo", requestId: "hung" } }).catch(() => undefined);
    const freeze = vi.spyOn(process, "call").mockImplementation((method, input, timeout) => call(method, input, method === "freeze" ? 100 : timeout));
    await expect(service.manager.dispatch({ operation: "disable", extensionId: service.catalog.get("personal.tasks")!.manifest.id, expectedRevision: service.database.revision() })).rejects.toThrow("Zeitlimit");
    freeze.mockRestore();
    await hung;
    expect(service.host.list()).toHaveLength(0);
    expect(service.pointers.readPointer("personal.tasks")).toBeNull();
    await service.manager.dispatch({ operation: "disable", extensionId: service.catalog.get("personal.tasks")!.manifest.id, expectedRevision: service.database.revision() });
    await service.manager.dispatch({ operation: "enable", extensionId: service.catalog.get("personal.tasks")!.manifest.id, expectedRevision: service.database.revision() });
    expect(await service.rpc("read")).toBe(17);
  });

  it("erhält eigene Dateien bei Reload und verwendet beim Rollback deren vorherigen Stand", async () => {
    const service = fixture();
    service.sources.updateState("personal.tasks", { trusted: true });
    const files = `import { readFileSync, writeFileSync, existsSync } from 'node:fs'; import { join } from 'node:path';
      export default { setup(ctx) { const path = join(ctx.paths.data, 'document.txt');
        if (!existsSync(path)) writeFileSync(path, 'Anfang');
        ctx.rpc.register('read', { handler() { return readFileSync(path, 'utf8'); } });
        ctx.rpc.register('write', { handler(value) { writeFileSync(path, value); } });
      } };`;
    service.publish("0.1.0", files);
    await service.install();
    await service.rpc("write", "Gespeichert");
    service.publish("0.2.0", files);
    await service.update();
    expect(await service.rpc("read")).toBe("Gespeichert");
    await service.rpc("write", "Neuer Stand");
    await service.manager.dispatch({ operation: "rollback", extensionId: service.catalog.get("personal.tasks")!.manifest.id, expectedRevision: service.database.revision(), targetVersion: semanticVersionSchema.parse("0.1.0"), enableAfterRollback: true });
    expect(await service.rpc("read")).toBe("Gespeichert");
  });
  it("startet ausschließlich ausdrücklich vertraute persönliche Releases", async () => {
    const service = fixture();
    service.publish("0.1.0", `export default { async setup(ctx) {
      ctx.effect(() => new Promise(resolve => setTimeout(resolve, 50)));
      await ctx.storage.migrate(1, async storage => { await storage.set('count', 1); });
      ctx.rpc.register('read', { handler() { return ctx.storage.get('count'); } });
    } };`);
    await expect(service.install()).rejects.toThrow("Vollvertrauen");
    expect(service.host.list()).toHaveLength(0);
    service.sources.updateState("personal.tasks", { trusted: true });
    expect((await service.install()).extension).toMatchObject({ lifecycle: "active", runtimeActive: true });
    expect(await service.rpc("read")).toBe(1);
    const before = service.pointers.readPointer("personal.tasks");
    await service.manager.dispatch({ operation: "disable", extensionId: service.catalog.get("personal.tasks")!.manifest.id, expectedRevision: service.database.revision() });
    expect(service.host.list()).toHaveLength(0);
    expect(service.pointers.readPointer("personal.tasks")).toBeNull();
    await service.manager.dispatch({ operation: "enable", extensionId: service.catalog.get("personal.tasks")!.manifest.id, expectedRevision: service.database.revision() });
    expect(await service.rpc("read")).toBe(1);
    expect(service.pointers.readPointer("personal.tasks")?.runtimeId).not.toBe(before?.runtimeId);
  });

  it("behält aktive Version und Daten nach fehlgeschlagener Migration", async () => {
    const service = fixture();
    service.sources.updateState("personal.tasks", { trusted: true });
    service.publish("0.1.0", initial);
    await service.install();
    await service.rpc("write", 7);
    const before = service.pointers.readPointer("personal.tasks");
    service.publish("0.2.0", `export default { async setup(ctx) { await ctx.storage.migrate(2, async storage => { await storage.set('count', 99); throw new Error('Migration abgebrochen'); }); } };`);
    await expect(service.update()).rejects.toThrow("Migration abgebrochen");
    expect(service.pointers.readPointer("personal.tasks")).toEqual(before);
    expect(await service.rpc("read")).toBe(7);
    expect(service.manager.detail("personal.tasks")).toMatchObject({ runtimeActive: true, activeVersion: "0.1.0" });
  });

  it("wechselt verifizierte Versionen und stellt beim Rollback den vorherigen eigenen Datenstand wieder her", async () => {
    const service = fixture();
    service.sources.updateState("personal.tasks", { trusted: true });
    service.publish("0.1.0", initial);
    await service.install();
    await service.rpc("write", 7);
    service.publish("0.2.0", initial.replace("ctx.rpc.register('read'", "await ctx.storage.migrate(2, storage => storage.set('count', 8)); ctx.rpc.register('read'"));
    const result = await service.update();
    expect(result.extension.activeVersion).toBe("0.2.0");
    expect(await service.rpc("read")).toBe(8);
    await service.manager.dispatch({ operation: "rollback", extensionId: service.catalog.get("personal.tasks")!.manifest.id, expectedRevision: service.database.revision(), targetVersion: "0.1.0", enableAfterRollback: true } as ExtensionManagementRequest);
    expect(service.manager.detail("personal.tasks")).toMatchObject({ activeVersion: "0.1.0", installedVersion: "0.1.0" });
    expect(await service.rpc("read")).toBe(7);
  });

  it("erkennt auch einen neuen lokalen Build mit gleicher Semver", async () => {
    const service = fixture();
    service.sources.updateState("personal.tasks", { trusted: true });
    service.publish("0.1.0", initial);
    await service.install();
    const before = service.pointers.readPointer("personal.tasks")!.packageIntegrity;
    service.publish("0.1.0", initial.replace("set('count', 1)", "set('count', 2)"));
    await service.update();
    expect(service.pointers.readPointer("personal.tasks")!.packageIntegrity).not.toBe(before);
    expect(await service.rpc("read")).toBe(1);
  });
});

describe("öffentliche Plugin-Schnittstellen", { timeout: 20_000 }, () => {
  it("verarbeitet Host-Hooks und wiederholt eine abgeschlossene Aktion bei einem Hook-Fehler nicht", async () => {
    const service = fixture({ handle: (id, method, input) => hub.handle(id, method, input), changed: () => hub.changed() });
    const api = new PluginHostApi();
    let writes = 0;
    api.register("demo.increment", { description: "Beispielaktion", mutates: true, hookable: true, input: z.object({ value: z.number() }), output: z.number(), handler: (input) => { writes++; return input.value; } });
    const hub = new PluginRuntimeHub(api, () => service.host.list(), join(service.root, "jobs.sqlite"), defaultPluginRuntimeConfig);
    service.cleanup.push(() => hub.close());
    service.sources.updateState("personal.tasks", { trusted: true });
    service.publish("0.1.0", `export default { setup(ctx) {
      ctx.hooks.register('demo.increment', 'before', event => { event.input.value += 2; });
      ctx.hooks.register('demo.increment', 'after', () => { throw new Error('Hook nach Commit fehlgeschlagen'); });
      ctx.rpc.register('go', { handler(input) { return ctx.host.call('demo.increment', input); } });
    } };`);
    await service.install();
    expect(await service.rpc("go", { value: 5 })).toBe(7);
    expect(writes).toBe(1);
    expect(hub.logEntries("personal.tasks").some((entry) => entry.message.includes("nachgelagerter Hook"))).toBe(true);
  });

  it("verbindet zwei unabhängige Plugins über Dienste und Ressourcen", async () => {
    const provider = fixture({ id: "personal.provider", handle: (id, method, input) => hub.handle(id, method, input), changed: () => hub.changed() });
    const consumer = fixture({ id: "personal.consumer", handle: (id, method, input) => hub.handle(id, method, input), changed: () => hub.changed() });
    const hub = new PluginRuntimeHub(new PluginHostApi(), () => [...provider.host.list(), ...consumer.host.list()], join(provider.root, "jobs.sqlite"), defaultPluginRuntimeConfig);
    provider.cleanup.push(() => hub.close());
    provider.sources.updateState("personal.provider", { trusted: true });
    consumer.sources.updateState("personal.consumer", { trusted: true });
    provider.publish("0.1.0", `export default { setup(ctx) {
      const tasks = ctx.storage.collection('tasks');
      ctx.services.provide('tasks', { add: { handler(input) { return tasks.put(input.id, { title: input.title }); } } });
      ctx.resources.register('tasks', { list() { return tasks.list(); } });
    } };`);
    consumer.publish("0.1.0", `export default { setup(ctx) {
      ctx.rpc.register('add', { handler(input) { return ctx.services.call('personal.provider:tasks', 'add', input); } });
      ctx.rpc.register('list', { handler() { return ctx.resources.list('personal.provider:tasks'); } });
    } };`);
    await provider.install();
    await consumer.install();
    await consumer.rpc("add", { id: "a", title: "Gemeinsame Aufgabe" });
    expect(await consumer.rpc("list")).toMatchObject([{ id: "a", value: { title: "Gemeinsame Aufgabe" } }]);
  });

  it("verarbeitet Ereignisse und führt registrierte Jobs mit dauerhaftem Laufverlauf aus", async () => {
    const service = fixture({ handle: (id, method, input) => hub.handle(id, method, input), changed: () => hub.changed() });
    const hub = new PluginRuntimeHub(new PluginHostApi(), () => service.host.list(), join(service.root, "jobs.sqlite"), defaultPluginRuntimeConfig);
    service.cleanup.push(() => hub.close());
    service.sources.updateState("personal.tasks", { trusted: true });
    service.publish("0.1.0", `export default { setup(ctx) {
      ctx.events.on('changed', async event => { await ctx.storage.set('last', event.data); });
      ctx.jobs.register('collect', { event: 'changed' }, async () => { await ctx.storage.set('count', (await ctx.storage.get('count') ?? 0) + 1); });
      ctx.rpc.register('fire', { async handler(input) { await ctx.events.emit('changed', input); return ctx.storage.get('count'); } });
      ctx.rpc.register('history', { handler() { return ctx.jobs.history(); } });
    } };`);
    await service.install();
    expect(await service.rpc("fire", { title: "Änderung" })).toBe(1);
    expect(await service.rpc("history")).toMatchObject([{ name: "collect", status: "succeeded" }]);
  });

  it("veröffentlicht nachträgliche Registrierungen über denselben Host", async () => {
    const service = fixture({ handle: (id, method, input) => hub.handle(id, method, input), changed: () => hub.changed() });
    const hub = new PluginRuntimeHub(new PluginHostApi(), () => service.host.list(), join(service.root, "jobs.sqlite"), defaultPluginRuntimeConfig);
    service.cleanup.push(() => hub.close());
    service.sources.updateState("personal.tasks", { trusted: true });
    service.publish("0.1.0", `export default { setup(ctx) {
      ctx.rpc.register('configure', { handler() { ctx.commands.register('dynamic', { title: 'Dynamisch', handler() { return 'Ergebnis'; } }); } });
    } };`);
    await service.install();
    await service.rpc("configure");
    await expect.poll(() => service.host.get("personal.tasks")!.description.commands.some((command) => command.name === "dynamic")).toBe(true);
    const request = { userId: "demo", requestId: "dynamic", signal: new AbortController().signal };
    expect(await hub.command("personal.tasks:dynamic", undefined, request)).toBe("Ergebnis");
  });
});
