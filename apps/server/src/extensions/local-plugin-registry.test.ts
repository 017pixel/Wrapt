import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "./catalog.js";
import { ExtensionDatabase } from "./database.js";
import { ExtensionManager } from "./manager.js";

let root: string | undefined;

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("Lokale Plugin-Registry", () => {
  it("speichert für aktive UI-Pakete die verifizierte Asset-Revision", async () => {
    root = mkdtempSync(join(tmpdir(), "local-plugin-registry-"));
    const packageDirectory = join(root, "catalog", "demo");
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(join(packageDirectory, "extension.json"), JSON.stringify({
      manifestVersion: 1,
      id: "wrapt.local.demo",
      name: "Demo Plugin",
      version: "1.0.0",
      publisher: "local",
      description: "Lokales UI-Testpaket",
      license: "MIT",
      engines: { wrapt: ">=0.98.0", extensionApi: ">=1.0.0" },
      trust: "catalog-first-party",
      entrypoints: { ui: "./index.js" },
      permissions: [],
      activationEvents: [],
      contributes: {},
    }));
    writeFileSync(join(packageDirectory, "index.js"), "export default {};");

    const database = new ExtensionDatabase(join(root, "extensions.sqlite"));
    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(join(root, "catalog"));
    const manager = new ExtensionManager(database);
    manager.attachCatalog(catalog);

    await manager.syncLocalPlugin("wrapt.local.demo");

    const detail = database.getExtension("wrapt.local.demo");
    expect(detail).toMatchObject({
      lifecycle: "active",
      runtimeActive: true,
      activeVersion: "1.0.0",
      activeAssetRevision: catalog.integrityOf("wrapt.local.demo"),
    });
    expect(manager.snapshot().extensions).toHaveLength(1);
    database.close();
  });
});
