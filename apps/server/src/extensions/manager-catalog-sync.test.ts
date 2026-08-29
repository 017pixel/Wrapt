import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExtensionManagementRequest, type ExtensionManifestV1 } from "@wrapt/extension-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "./catalog.js";
import { ExtensionDatabase } from "./database.js";
import { ExtensionManager } from "./manager.js";

function manifest(id: string, version: string): ExtensionManifestV1 {
  return {
    manifestVersion: 1,
    id,
    name: "Catalog Extension",
    version,
    publisher: "workbench",
    description: "Nested transaction test",
    license: "MIT",
    engines: { wrapt: "^0.95.0", extensionApi: "^1.0.0" },
    trust: "catalog-first-party",
    entrypoints: { ui: "./index.js" },
    permissions: [],
    activationEvents: [],
    contributes: {},
  } as unknown as ExtensionManifestV1;
}

let root: string | undefined;

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("Catalog-Synchronisierung nach Manager-Transaktionen", () => {
  it("öffnet keine verschachtelte SQLite-Transaktion", async () => {
    root = mkdtempSync(join(tmpdir(), "extension-catalog-sync-"));
    const packageDirectory = join(root, "catalog", "catalog-extension");
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(join(packageDirectory, "extension.json"), JSON.stringify(manifest("workbench.catalog-extension", "2.0.0")));
    writeFileSync(join(packageDirectory, "index.js"), "export default {};\n");
    const database = new ExtensionDatabase(join(root, "extensions.sqlite"));
    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(join(root, "catalog"));
    const manager = new ExtensionManager(database);
    manager.attachCatalog(catalog);
    const extensionId = "workbench.catalog-extension";
    await manager.dispatch({
      operation: "install",
      extensionId,
      expectedRevision: database.revision(),
      source: {
        kind: "catalog",
        providerId: "wrapt-catalog",
        catalogRevision: catalog.revision(),
        version: "2.0.0",
        packageIntegrity: catalog.integrityOf(extensionId)!,
      },
      enableAfterInstall: false,
    } as ExtensionManagementRequest);
    const installed = database.getExtension(extensionId)!;
    database.upsertExtension({
      ...installed,
      manifest: { ...installed.manifest, version: "1.0.0" as never },
      installedVersion: "1.0.0" as never,
      lifecycle: "installed",
      runtimeActive: false,
    });
    manager.registerDiscovered(manifest("workbench.other", "1.0.0"), {
      kind: "developer",
      registrationId: "00000000-0000-4000-8000-000000000001",
    });

    const result = await manager.dispatch({
      operation: "install",
      extensionId: "workbench.other",
      expectedRevision: database.revision(),
      source: { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" },
      enableAfterInstall: false,
    } as ExtensionManagementRequest);

    expect(result.operation.status).toBe("succeeded");
    expect(database.getExtension(extensionId)?.lifecycle).toBe("update-available");
    database.close();
  });
});
