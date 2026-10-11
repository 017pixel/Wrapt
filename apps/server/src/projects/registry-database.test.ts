import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRegistryDatabase, registeredProjectId } from "./registry-database.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ProjectRegistryDatabase", () => {
  it("keeps one stable project identity for a canonical path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-project-registry-"));
    directories.push(directory);
    const databasePath = join(directory, "workbench.sqlite");
    const projectPath = join(directory, "Mein Projekt");
    const registry = new ProjectRegistryDatabase(databasePath);
    const first = registry.register(projectPath, "Mein Projekt", "2026-07-22T10:00:00.000Z");
    const second = registry.register(projectPath, "Anderer Name", "2026-07-22T11:00:00.000Z");
    expect(first).toMatchObject({ created: true, project: { id: registeredProjectId(projectPath), name: "Mein Projekt" } });
    expect(second).toEqual({ project: first.project, created: false });
    registry.close();

    const reopened = new ProjectRegistryDatabase(databasePath);
    expect(reopened.list()).toEqual([first.project]);
    reopened.close();
  });

  it("bleibt bei parallelem Register desselben Pfads idempotent (D-010)", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-project-registry-"));
    directories.push(directory);
    const databasePath = join(directory, "workbench.sqlite");
    const projectPath = join(directory, "Gleiches Projekt");
    const first = new ProjectRegistryDatabase(databasePath);
    const second = new ProjectRegistryDatabase(databasePath);
    const [left, right] = [first.register(projectPath), second.register(projectPath)];
    expect([left.created, right.created].sort()).toEqual([false, true]);
    expect(left.project).toEqual(right.project);
    expect(first.list()).toHaveLength(1);
    first.close();
    second.close();
  });
});
