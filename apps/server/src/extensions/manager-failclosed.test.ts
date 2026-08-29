import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extensionIdSchema, semanticVersionSchema, sha256IntegritySchema } from "@wrapt/extension-contracts";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "./catalog.js";
import { ExtensionDatabase } from "./database.js";
import { ExtensionManager } from "./manager.js";
import { ExtensionReleaseStore } from "./release-store.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Extension-Lifecycle für nicht aktivierbare Pakete", () => {
  it("meldet Catalog-Installationen als installiert und blockiert Aktivierung", async () => {
    const root = mkdtempSync(join(tmpdir(), "extension-failclosed-"));
    directories.push(root);
    const packageDirectory = join(root, "catalog", "demo");
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(join(packageDirectory, "extension.json"), JSON.stringify({
      manifestVersion: 1,
      id: "workbench.demo",
      name: "Demo",
      version: "1.0.0",
      publisher: "workbench",
      description: "Fail-closed test",
      license: "MIT",
      engines: { wrapt: "^0.95.0", extensionApi: "^1.0.0" },
      trust: "catalog-first-party",
      entrypoints: { ui: "./index.js" },
      permissions: [],
      activationEvents: [],
      contributes: {},
    }));

    const database = new ExtensionDatabase(join(root, "extensions.sqlite"));
    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(join(root, "catalog"));
    const releaseStore = new ExtensionReleaseStore(join(root, "releases"));
    const manager = new ExtensionManager(database, undefined, releaseStore);
    manager.attachCatalog(catalog);
    const extensionId = extensionIdSchema.parse("workbench.demo");
    const version = semanticVersionSchema.parse("1.0.0");
    const packageIntegrity = sha256IntegritySchema.parse(catalog.integrityOf(extensionId)!);
    const catalogRevision = sha256IntegritySchema.parse(catalog.revision());
    const result = await manager.dispatch({
      operation: "install",
      extensionId,
      expectedRevision: database.revision(),
      source: {
        kind: "catalog",
        providerId: defaultCatalogProviderId(),
        catalogRevision,
        version,
        packageIntegrity,
      },
      enableAfterInstall: true,
    });

    expect(result.extension).toMatchObject({ lifecycle: "installed", desiredEnablement: "disabled", runtimeActive: false });
    expect(releaseStore.readSlot(extensionId, version, packageIntegrity)).toMatchObject({
      extensionId,
      version,
      packageIntegrity,
    });
    expect(result.extension.allowedOperations).not.toContain("enable");
    await expect(manager.dispatch({
      operation: "enable",
      extensionId,
      expectedRevision: database.revision(),
    })).rejects.toMatchObject({ code: "activation-failed", statusCode: 409 });
    database.close();
  });
});
