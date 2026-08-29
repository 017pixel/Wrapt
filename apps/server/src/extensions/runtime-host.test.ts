import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  extensionIdSchema,
  semanticVersionSchema,
  sha256IntegritySchema,
  type ExtensionManagementRequest,
} from "@wrapt/extension-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "./catalog.js";
import { ExtensionDatabase } from "./database.js";
import { ExtensionManager } from "./manager.js";
import { ExtensionReleaseStore } from "./release-store.js";
import { ExtensionRuntimeHost } from "./runtime-host.js";

const roots: string[] = [];
const id = extensionIdSchema.parse("wrapt.example.focus-timer");

function request(catalog: LocalExtensionCatalog, database: ExtensionDatabase, version: string, integrity: string): ExtensionManagementRequest {
  return {
    operation: "install",
    extensionId: id,
    expectedRevision: database.revision(),
    source: {
      kind: "catalog",
      providerId: defaultCatalogProviderId(),
      catalogRevision: sha256IntegritySchema.parse(catalog.revision()),
      version: semanticVersionSchema.parse(version),
      packageIntegrity: sha256IntegritySchema.parse(integrity),
    },
    enableAfterInstall: true,
  };
}

function createRuntime(options: { releaseStep?: () => void; pointerStep?: () => void } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "extension-runtime-host-"));
  roots.push(root);
  const packageDirectory = resolve(root, "catalog/focus-timer");
  mkdirSync(resolve(root, "catalog"), { recursive: true });
  cpSync(resolve(import.meta.dirname, "../../../../extensions/plugins/focus-timer"), packageDirectory, { recursive: true });
  const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
  catalog.addSourceDirectory(resolve(root, "catalog"));
  const database = new ExtensionDatabase(resolve(root, "extensions.sqlite"));
  const releases = new ExtensionReleaseStore(resolve(root, "releases"), options.releaseStep ? { onStep: options.releaseStep } : {});
  const host = new ExtensionRuntimeHost(resolve(root, "runtime"), releases, options.pointerStep ? { onStep: options.pointerStep } : {});
  const manager = new ExtensionManager(database, undefined, releases, host);
  manager.attachCatalog(catalog);
  return { root, packageDirectory, catalog, database, releases, host, manager };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Extension Runtime Host", () => {
  it("aktiviert einen verifizierten Slot, schreibt Pointer und liefert Slot-Inhalt", async () => {
    const runtime = createRuntime();
    const integrity = runtime.catalog.integrityOf(id)!;
    const result = await runtime.manager.dispatch(request(runtime.catalog, runtime.database, "1.0.0", integrity));

    expect(result.extension).toMatchObject({ lifecycle: "active", runtimeActive: true, activeVersion: "1.0.0", activeAssetRevision: integrity });
    expect(result.extension.allowedOperations).toContain("disable");
    expect(runtime.manager.detail(id).health.status).toBe("healthy");
    expect(runtime.host.readPointer(id)).toMatchObject({ extensionId: id, version: "1.0.0", packageIntegrity: integrity, health: { status: "healthy" } });
    expect(runtime.host.activeContent(id)?.content.slug).toBe("focus-timer");
    expect(readFileSync(resolve(runtime.host.activeContent(id)!.pointer ? runtime.releases.readSlot(id, "1.0.0", sha256IntegritySchema.parse(integrity))!.packageDirectory : runtime.root, "plugin.json"), "utf8")).toContain("Fokus-Timer");
    runtime.database.close();
  });

  it("stellt nach Neustart nur bei intaktem Pointer aktiv wieder her", async () => {
    const runtime = createRuntime();
    const integrity = runtime.catalog.integrityOf(id)!;
    await runtime.manager.dispatch(request(runtime.catalog, runtime.database, "1.0.0", integrity));
    runtime.database.close();

    const reopened = new ExtensionDatabase(resolve(runtime.root, "extensions.sqlite"));
    const host = new ExtensionRuntimeHost(resolve(runtime.root, "runtime"), runtime.releases);
    const manager = new ExtensionManager(reopened, undefined, runtime.releases, host);
    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(resolve(runtime.root, "catalog"));
    manager.attachCatalog(catalog);
    manager.reconcileRuntime();
    expect(reopened.getExtension(id)).toMatchObject({ lifecycle: "active", runtimeActive: true, activeVersion: "1.0.0" });

    writeFileSync(resolve(runtime.root, "runtime", id, "current.json"), "{ beschädigt");
    manager.reconcileRuntime();
    expect(reopened.getExtension(id)).toMatchObject({ lifecycle: "installed", runtimeActive: false, activeVersion: undefined });
    expect(existsSync(resolve(runtime.root, "runtime", id, "current.json"))).toBe(false);
    reopened.close();
  });

  it("schaltet beim Update und Rollback den vollständigen Runtime-Slot um", async () => {
    const runtime = createRuntime();
    const firstIntegrity = runtime.catalog.integrityOf(id)!;
    await runtime.manager.dispatch(request(runtime.catalog, runtime.database, "1.0.0", firstIntegrity));
    writeFileSync(resolve(runtime.packageDirectory, "extension.json"), JSON.stringify({
      ...runtime.catalog.manifestOf(id),
      version: "2.0.0",
    }));
    const content = JSON.parse(readFileSync(resolve(runtime.packageDirectory, "plugin.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(resolve(runtime.packageDirectory, "plugin.json"), JSON.stringify({ ...content, version: "2.0.0", name: "Fokus-Timer 2" }));
    runtime.catalog.refresh();
    const secondIntegrity = runtime.catalog.integrityOf(id)!;
    runtime.manager.syncCatalogUpdates();
    await runtime.manager.dispatch({
      operation: "update",
      extensionId: id,
      expectedRevision: runtime.database.revision(),
      target: {
        providerId: defaultCatalogProviderId(),
        catalogRevision: sha256IntegritySchema.parse(runtime.catalog.revision()),
        version: semanticVersionSchema.parse("2.0.0"),
        packageIntegrity: sha256IntegritySchema.parse(secondIntegrity),
      },
    });
    expect(runtime.host.activeContent(id)?.content.name).toBe("Fokus-Timer 2");
    const rolledBack = await runtime.manager.dispatch({ operation: "rollback", extensionId: id, expectedRevision: runtime.database.revision(), targetVersion: semanticVersionSchema.parse("1.0.0"), enableAfterRollback: true });
    expect(rolledBack.extension).toMatchObject({ lifecycle: "active", runtimeActive: true, activeVersion: "1.0.0", activeAssetRevision: firstIntegrity });
    expect(runtime.host.activeContent(id)?.content.name).toBe("Fokus-Timer");
    runtime.database.close();
  });

  it("prüft jede Capability-Nutzung erneut und erlaubt keine Scope-Erweiterung", async () => {
    const runtime = createRuntime();
    const integrity = runtime.catalog.integrityOf(id)!;
    await runtime.manager.dispatch(request(runtime.catalog, runtime.database, "1.0.0", integrity));
    const audit: string[] = [];
    const broker = runtime.host.broker(id, [{ permission: "projects.read", scope: { projects: ["id:wrapt"] } }]);
    broker.assertAllowed("projects.read", { projects: ["id:wrapt"] });
    await broker.invoke("projects.read", { projects: ["id:wrapt"] }, () => audit.push("read"));
    expect(audit).toEqual(["read"]);
    expect(() => broker.assertAllowed("projects.read", { projects: ["id:other"] })).toThrow(/Grant/);
    expect(() => broker.assertAllowed("files.write", { projects: ["id:wrapt"] })).toThrow(/Grant/);
    runtime.database.close();
  });

  it("kompensiert einen Fehler direkt nach der Release-Publikation", async () => {
    let injected = true;
    const runtime = createRuntime({ releaseStep: () => {
      if (injected) {
        injected = false;
        throw new Error("fault:release-published");
      }
    } });
    const integrity = runtime.catalog.integrityOf(id)!;
    await expect(runtime.manager.dispatch(request(runtime.catalog, runtime.database, "1.0.0", integrity))).rejects.toThrow("fault:release-published");
    expect(runtime.database.getExtension(id)).toBeNull();
    expect(runtime.releases.readSlot(id, "1.0.0", sha256IntegritySchema.parse(integrity))).not.toBeNull();
    const retry = await runtime.manager.dispatch(request(runtime.catalog, runtime.database, "1.0.0", integrity));
    expect(retry.extension.runtimeActive).toBe(true);
    runtime.database.close();
  });

  it("stellt den alten Zustand nach einem Fehler direkt nach Pointer-Publikation wieder her", async () => {
    let injected = true;
    const runtime = createRuntime({ pointerStep: () => {
      if (injected) {
        injected = false;
        throw new Error("fault:pointer-written");
      }
    } });
    const integrity = runtime.catalog.integrityOf(id)!;
    await expect(runtime.manager.dispatch(request(runtime.catalog, runtime.database, "1.0.0", integrity))).rejects.toMatchObject({ code: "health-check-failed" });
    expect(runtime.database.getExtension(id)).toBeNull();
    expect(runtime.host.readPointer(id)).toBeNull();
    const retry = await runtime.manager.dispatch(request(runtime.catalog, runtime.database, "1.0.0", integrity));
    expect(retry.extension).toMatchObject({ lifecycle: "active", runtimeActive: true });
    runtime.database.close();
  });

  it("rollt eine Registry-Transaktion nach einem nachgelagerten Fehler vollständig zurück", () => {
    const root = mkdtempSync(resolve(tmpdir(), "extension-transaction-fault-"));
    roots.push(root);
    const database = new ExtensionDatabase(resolve(root, "extensions.sqlite"));
    const before = database.revision();
    expect(() => database.transaction(() => {
      database.bumpRevision();
      throw new Error("fault:database-commit");
    })).toThrow("fault:database-commit");
    expect(database.revision()).toBe(before);
    database.close();
  });
});
