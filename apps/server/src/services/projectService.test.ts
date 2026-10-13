import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectRegistryDatabase } from "../projects/registry-database.js";
import { createProjectService } from "./projectService.js";

const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("project service registry", () => {
  it.each([10, 100, 1_000])("teilt Discovery für %i Ordner zwischen zehn Details, Liste und Referenzen", async (count) => {
    const root = await mkdtemp(join(tmpdir(), "project-discovery-shared-"));
    directories.push(root);
    await Promise.all(Array.from({ length: count }, (_, index) => mkdir(join(root, `project-${index}`))));
    const registry = new ProjectRegistryDatabase(join(root, "registry.sqlite"));
    try {
      const register = vi.spyOn(registry, "register");
      const list = vi.spyOn(registry, "list");
      const activity = { get: vi.fn(async () => ({ lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null })), touch: vi.fn(() => "2026-10-12T00:00:00Z") };
      const service = createProjectService({ projects: [] }, [], { enabled: true, rootDirectory: root }, activity as never, registry);
      await service.listReferences();
      expect(activity.get).not.toHaveBeenCalled();
      expect(register).toHaveBeenCalledTimes(count);
      register.mockClear();
      list.mockClear();
      await Promise.all([...Array.from({ length: 10 }, (_, index) => service.get(`project-${index}`)), service.list(), service.listReferences()]);
      expect(list).not.toHaveBeenCalled();
      expect(register).not.toHaveBeenCalled();
      await service.touch("project-0");
      await service.listReferences();
      expect(list).not.toHaveBeenCalled();
      vi.useFakeTimers();
      vi.advanceTimersByTime(60_000);
      await service.listReferences();
      expect(list).toHaveBeenCalledOnce();
      expect(register).not.toHaveBeenCalled();
    } finally { registry.close(); }
  });

  it("erkennt externe Ordner nach TTL und hält Verfügbarkeit im Detail frisch", async () => {
    const root = await mkdtemp(join(tmpdir(), "project-discovery-ttl-"));
    directories.push(root);
    await mkdir(join(root, "first"));
    const service = createProjectService({ projects: [] }, [], { enabled: true, rootDirectory: root });
    expect((await service.listReferences()).map((project) => project.id)).toEqual(["first"]);
    await mkdir(join(root, "second"));
    expect((await service.listReferences())).toHaveLength(1);
    await rm(join(root, "first"), { recursive: true });
    expect((await service.get("first")).project.availability).toBe("missing");
    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    expect((await service.list()).projects.map((project) => project.id)).toEqual(["second"]);
  });
  it("lädt direkte Unterordner dynamisch aus dem konfigurierten Projekt-Root", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-project-discovery-"));
    directories.push(root);
    await mkdir(join(root, "alpha"));
    await mkdir(join(root, "beta"));
    await mkdir(join(root, ".versteckt"));

    const service = createProjectService(
      { projects: [] },
      [],
      { enabled: true, rootDirectory: root },
    );

    await expect(service.list()).resolves.toMatchObject({
      projectsRoot: root,
      projects: [
        { id: "alpha", name: "alpha", path: join(root, "alpha") },
        { id: "beta", name: "beta", path: join(root, "beta") },
      ],
    });
  });

  it("nutzt feste Einträge nur als Metadaten für vorhandene Root-Ordner", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-project-metadata-"));
    directories.push(root);
    await mkdir(join(root, "live-project"));

    const service = createProjectService(
      { projects: [
        { id: "live", name: "Alter Name", description: "Alt", path: join(root, "live-project"), enabled: true, sortOrder: 1, previews: [] },
        { id: "removed", name: "Entfernt", description: "Alt", path: join(root, "removed-project"), enabled: true, sortOrder: 2, previews: [] },
      ] },
      [],
      { enabled: true, rootDirectory: root },
    );

    await expect(service.list()).resolves.toMatchObject({
      projects: [{ id: "live", name: "live-project", path: join(root, "live-project"), availability: "available" }],
    });
  });

  it("reuses discovered projects and persists arbitrary registered folders", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-project-service-"));
    directories.push(root);
    const discoveredPath = join(root, "discovered");
    const nestedPath = join(root, "other", "nested");
    await mkdir(discoveredPath);
    await mkdir(nestedPath, { recursive: true });
    const registry = new ProjectRegistryDatabase(join(root, "workbench.sqlite"));
    const service = createProjectService(
      { projects: [] },
      [],
      { enabled: true, rootDirectory: root },
      undefined,
      registry,
    );

    const existing = await service.register(discoveredPath);
    expect(existing).toMatchObject({ created: false, project: { id: "discovered", path: discoveredPath } });
    const registered = await service.register(nestedPath);
    expect(registered).toMatchObject({ created: true, project: { path: nestedPath, availability: "available" } });
    expect((await service.get(registered.project.id)).project.path).toBe(nestedPath);

    await rm(nestedPath, { recursive: true });
    expect((await service.get(registered.project.id)).project.availability).toBe("missing");
    registry.close();
  });

  it("behält die ID eines erkannten Projekts trotz späterer Slug-Kollision", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-project-collision-"));
    directories.push(root);
    const originalPath = join(root, "my_app");
    await mkdir(originalPath);
    const registry = new ProjectRegistryDatabase(join(root, "workbench.sqlite"));
    const firstService = createProjectService({ projects: [] }, [], { enabled: true, rootDirectory: root }, undefined, registry);
    const first = (await firstService.list()).projects.find((project) => project.path === originalPath);
    expect(first?.id).toBe("my-app");

    await mkdir(join(root, "my-app"));
    const secondService = createProjectService({ projects: [] }, [], { enabled: true, rootDirectory: root }, undefined, registry);
    const afterCollision = (await secondService.list()).projects.find((project) => project.path === originalPath);
    expect(afterCollision?.id).toBe(first?.id);
    expect(new Set((await secondService.list()).projects.map((project) => project.id)).size).toBe(2);
    registry.close();
  });
});
