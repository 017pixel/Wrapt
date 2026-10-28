import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { ProjectRegistryDatabase } from "./registry-database.js";

it("übernimmt vorhandene Projektidentitäten und lässt die historische Tabelle unverändert", async () => {
  const root = await mkdtemp(join(tmpdir(), "wrapt-legacy-projects-"));
  const path = join(root, "projects.sqlite");
  const raw = new DatabaseSync(path);
  raw.exec(`CREATE TABLE orbit_project_registry(id TEXT PRIMARY KEY, canonical_path TEXT UNIQUE, name TEXT, created_at TEXT);
    INSERT INTO orbit_project_registry VALUES('custom-original','/home/test/project','Projekt','2026-10-25T00:00:00.000Z')`);
  const before = raw.prepare("SELECT * FROM orbit_project_registry").all();
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const registry = new ProjectRegistryDatabase(path);
      try {
        expect(registry.findByPath("/home/test/project")?.id).toBe("custom-original");
        expect(registry.register("/home/test/project").created).toBe(false);
        expect(raw.prepare("SELECT * FROM orbit_project_registry").all()).toEqual(before);
      } finally { registry.close(); }
    }
  } finally {
    raw.close();
    await rm(root, { recursive: true, force: true });
  }
});
