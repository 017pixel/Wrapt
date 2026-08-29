import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extensionIdSchema,
  semanticVersionSchema,
  sha256IntegritySchema,
} from "@wrapt/extension-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "./catalog.js";
import { ExtensionDatabase } from "./database.js";
import { ExtensionManager } from "./manager.js";
import { ExtensionReleaseStore } from "./release-store.js";

const roots: string[] = [];

function writeManifest(directory: string, version: string): void {
  writeFileSync(join(directory, "extension.json"), JSON.stringify({
    manifestVersion: 1,
    id: "workbench.rollback",
    name: `Rollback ${version}`,
    version,
    publisher: "workbench",
    description: `Rollback-Test ${version}`,
    license: "MIT",
    engines: { wrapt: "^0.95.0", extensionApi: "^1.0.0" },
    trust: "catalog-first-party",
    entrypoints: { server: "./server.js" },
    permissions: [],
    activationEvents: [],
    contributes: {},
  }));
  writeFileSync(join(directory, "server.js"), `export const version = ${JSON.stringify(version)};\n`);
}

function request(
  revision: number,
  version: string,
  integrity: string,
  catalogRevision: string,
) {
  return {
    operation: "install" as const,
    extensionId: extensionIdSchema.parse("workbench.rollback"),
    expectedRevision: revision,
    source: {
      kind: "catalog" as const,
      providerId: defaultCatalogProviderId(),
      catalogRevision: sha256IntegritySchema.parse(catalogRevision),
      version: semanticVersionSchema.parse(version),
      packageIntegrity: sha256IntegritySchema.parse(integrity),
    },
    enableAfterInstall: false,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Extension-Rollback auf Release-Slots", () => {
  it("stellt den vorherigen verifizierten Catalog-Slot ohne Runtime-Aktivität wieder her", async () => {
    const root = mkdtempSync(join(tmpdir(), "extension-rollback-"));
    roots.push(root);
    const packageDirectory = join(root, "catalog", "rollback");
    mkdirSync(packageDirectory, { recursive: true });
    writeManifest(packageDirectory, "1.0.0");

    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(join(root, "catalog"));
    const database = new ExtensionDatabase(join(root, "extensions.sqlite"));
    const releases = new ExtensionReleaseStore(join(root, "releases"));
    const manager = new ExtensionManager(database, undefined, releases);
    manager.attachCatalog(catalog);
    const id = extensionIdSchema.parse("workbench.rollback");
    const firstIntegrity = sha256IntegritySchema.parse(catalog.integrityOf(id)!);
    const firstRevision = sha256IntegritySchema.parse(catalog.revision());
    await manager.dispatch(request(database.revision(), "1.0.0", firstIntegrity, firstRevision));

    writeManifest(packageDirectory, "2.0.0");
    catalog.refresh();
    const secondIntegrity = sha256IntegritySchema.parse(catalog.integrityOf(id)!);
    const secondRevision = sha256IntegritySchema.parse(catalog.revision());
    manager.syncCatalogUpdates();
    const available = manager.snapshot().extensions[0]!;
    expect(available.availableVersion).toBe("2.0.0");
    await manager.dispatch({
      ...request(database.revision(), "2.0.0", secondIntegrity, secondRevision),
      operation: "update",
      target: {
        providerId: defaultCatalogProviderId(),
        catalogRevision: secondRevision,
        version: semanticVersionSchema.parse("2.0.0"),
        packageIntegrity: secondIntegrity,
      },
    });

    const current = manager.detail(id);
    expect(current.rollbackVersion).toBe("1.0.0");
    expect(current.source).toMatchObject({ packageIntegrity: secondIntegrity });
    const rolledBack = await manager.dispatch({
      operation: "rollback",
      extensionId: id,
      expectedRevision: database.revision(),
      targetVersion: semanticVersionSchema.parse("1.0.0"),
      enableAfterRollback: false,
    });

    expect(rolledBack.extension).toMatchObject({
      installedVersion: "1.0.0",
      lifecycle: "disabled",
      runtimeActive: false,
      rollbackVersion: "2.0.0",
      rollbackAssetRevision: secondIntegrity,
      source: { packageIntegrity: firstIntegrity },
    });
    expect(rolledBack.extension.source).toMatchObject({ packageIntegrity: firstIntegrity });
    expect(releases.readVersion(id, "1.0.0")).not.toBeNull();
    expect(rolledBack.extension.allowedOperations).toContain("rollback");
    database.close();
  });
});
