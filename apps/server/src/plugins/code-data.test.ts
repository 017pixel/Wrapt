import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginDataStore } from "./code-data.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function path() {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-plugin-data-"));
  directories.push(directory);
  return join(directory, "data.sqlite");
}

describe("Plugin-Datenhaltung", () => {
  it("erstellt Snapshots nach parallelen Abfragen mehrerer indexierter Collections", async () => {
    const store = new PluginDataStore(path());
    try {
      const tasks = store.api.collection("tasks", { indexes: ["projectId", "status", "createdAt"] });
      const entries = store.api.collection("entries", { indexes: ["projectId", "source", "createdAt"] });
      const snapshots = store.api.collection("snapshots", { indexes: ["projectId", "capturedAt"] });
      await store.api.set("trackedProjects", ["example"]);
      for (let i = 0; i < 15; i++) await tasks.create({ projectId: "example", status: "offen", createdAt: new Date().toISOString() });
      await entries.create({ projectId: "example", source: "notiz", createdAt: new Date().toISOString() });
      await snapshots.create({ projectId: "example", capturedAt: new Date().toISOString() });
      await Promise.all([tasks.list(), entries.list(), snapshots.list({ orderBy: "capturedAt", descending: true }), store.api.get("trackedProjects")]);
      const target = path();
      await store.snapshot(target);
      const restored = new PluginDataStore(target);
      try { expect(await restored.api.collection("tasks").list()).toHaveLength(15); }
      finally { await restored.close(); }
    } finally { await store.close(); }
  }, 10_000);
  it("speichert Datensätze dauerhaft, filtert indexierte Felder und schützt Revisionen", async () => {
    const filename = path();
    const first = new PluginDataStore(filename);
    const tasks = first.api.collection<{ title: string; done: boolean }>("tasks", { indexes: ["done"] });
    const saved = await tasks.put("eins", { title: "Prüfen", done: false });
    expect(saved.revision).toBe(1);
    await expect(tasks.put("eins", { title: "Veraltet", done: true }, { expectedRevision: 0 })).rejects.toThrow("inzwischen");
    await tasks.put("zwei", { title: "Erledigt", done: true });
    expect((await tasks.list({ filter: { done: false } })).map((record) => record.id)).toEqual(["eins"]);
    await first.close();
    const second = new PluginDataStore(filename);
    expect(await second.api.collection("tasks").get("eins")).toMatchObject({ value: { title: "Prüfen" }, revision: 1 });
    await second.close();
  });

  it("rollt fehlgeschlagene Migrationen einschließlich asynchroner Writes zurück", async () => {
    const store = new PluginDataStore(path());
    await store.api.set("initial", 1);
    await expect(store.api.migrate(1, async (storage) => {
      await storage.set("initial", 2);
      await storage.collection("tasks").put("new", { title: "Soll nicht bleiben" });
      throw new Error("Migration fehlgeschlagen");
    })).rejects.toThrow("Migration fehlgeschlagen");
    expect(await store.api.get("initial")).toBe(1);
    expect(await store.api.collection("tasks").get("new")).toBeNull();
    await store.api.migrate(1, (storage) => storage.set("initial", 3));
    await store.api.migrate(1, (storage) => storage.set("initial", 4));
    expect(await store.api.get("initial")).toBe(3);
    await store.close();
  });

  it("serialisiert konkurrierende Transaktionen ohne verschachtelte BEGINs", async () => {
    const store = new PluginDataStore(path());
    await store.api.set("count", 0);
    await Promise.all(Array.from({ length: 8 }, () => store.api.transaction(async () => {
      const current = await store.api.get<number>("count");
      await store.api.set("count", (current ?? 0) + 1);
    })));
    expect(await store.api.get("count")).toBe(8);
    await store.close();
  });

  it("erstellt konsistente Snapshots und lehnt Query-Injection ab", async () => {
    const store = new PluginDataStore(path());
    await store.api.set("saved", { value: 42 });
    const snapshot = path();
    await store.snapshot(snapshot);
    await store.api.set("saved", { value: 43 });
    const restored = new PluginDataStore(snapshot);
    expect(await restored.api.get("saved")).toEqual({ value: 42 });
    await expect(store.api.collection("tasks").list({ orderBy: "x'); DROP TABLE plugin_values;--" })).rejects.toThrow();
    await restored.close();
    await store.close();
  });
});
