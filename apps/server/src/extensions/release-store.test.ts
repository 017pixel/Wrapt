import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extensionIdSchema,
  semanticVersionSchema,
  sha256IntegritySchema,
} from "@wrapt/extension-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "./catalog.js";
import { ExtensionReleaseStore } from "./release-store.js";

const roots: string[] = [];

function createCatalog(): { root: string; catalog: LocalExtensionCatalog } {
  const root = mkdtempSync(join(tmpdir(), "extension-release-store-"));
  roots.push(root);
  const packageDirectory = join(root, "catalog", "demo");
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(join(packageDirectory, "extension.json"), JSON.stringify({
    manifestVersion: 1,
    id: "workbench.demo",
    name: "Demo",
    version: "1.0.0",
    publisher: "workbench",
    description: "Release-Slot-Test",
    license: "MIT",
    engines: { wrapt: "^0.95.0", extensionApi: "^1.0.0" },
    trust: "catalog-first-party",
    entrypoints: { ui: "./index.js" },
    permissions: [{ permission: "projects.read" }],
    activationEvents: [],
    contributes: {},
  }));
  writeFileSync(join(packageDirectory, "index.js"), "export default {};\n");
  const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
  catalog.addSourceDirectory(join(root, "catalog"));
  return { root, catalog };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Extension Release Store", () => {
  it("legt einen unveränderlichen, lesbaren Catalog-Slot ab", () => {
    const { root, catalog } = createCatalog();
    const store = new ExtensionReleaseStore(join(root, "releases"));
    const extensionId = extensionIdSchema.parse("workbench.demo");
    const version = semanticVersionSchema.parse("1.0.0");
    const integrity = sha256IntegritySchema.parse(catalog.integrityOf(extensionId)!);

    const slot = store.stageCatalogPackage(catalog, catalog.manifestOf(extensionId)!, integrity, []);
    expect(store.readSlot(extensionId, version, integrity)).toMatchObject({
      packageDirectory: slot.packageDirectory,
      extensionId,
      version,
      packageIntegrity: integrity,
    });
    writeFileSync(join(catalog.packageDirectoryOf(extensionId)!, "index.js"), "mutated\n");
    expect(readFileSync(join(slot.packageDirectory, "index.js"), "utf8")).toBe("export default {};\n");
  });

  it("aktualisiert Grants atomar, ohne das Paket neu zu kopieren", () => {
    const { root, catalog } = createCatalog();
    const store = new ExtensionReleaseStore(join(root, "releases"));
    const extensionId = extensionIdSchema.parse("workbench.demo");
    const integrity = sha256IntegritySchema.parse(catalog.integrityOf(extensionId)!);
    const manifest = catalog.manifestOf(extensionId)!;
    const initial = store.stageCatalogPackage(catalog, manifest, integrity, []);
    const updated = store.stageCatalogPackage(catalog, manifest, integrity, [{ permission: "projects.read" }]);

    expect(updated.packageDirectory).toBe(initial.packageDirectory);
    expect(store.readSlot(extensionId, manifest.version, integrity)?.grantedPermissions).toEqual([
      { permission: "projects.read" },
    ]);
  });

  it("verwirft manipulierte Slot-Metadaten fail-closed", () => {
    const { root, catalog } = createCatalog();
    const releaseRoot = join(root, "releases");
    const store = new ExtensionReleaseStore(releaseRoot);
    const extensionId = extensionIdSchema.parse("workbench.demo");
    const integrity = sha256IntegritySchema.parse(catalog.integrityOf(extensionId)!);
    store.stageCatalogPackage(catalog, catalog.manifestOf(extensionId)!, integrity, []);
    const metadataPath = join(releaseRoot, extensionId, "1.0.0", integrity.slice("sha256:".length), "release.json");
    writeFileSync(metadataPath, "{\"manifest\":null}\n");

    expect(store.readSlot(extensionId, "1.0.0", integrity)).toBeNull();
  });

  it("verweigert eine manipulierte ID-Verzeichniskette", () => {
    const { root, catalog } = createCatalog();
    const releaseRoot = join(root, "releases");
    const store = new ExtensionReleaseStore(releaseRoot);
    const extensionId = extensionIdSchema.parse("workbench.demo");
    const integrity = sha256IntegritySchema.parse(catalog.integrityOf(extensionId)!);
    rmSync(join(releaseRoot, extensionId), { recursive: true, force: true });
    const outside = join(root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(releaseRoot, extensionId), "dir");

    expect(() => store.stageCatalogPackage(catalog, catalog.manifestOf(extensionId)!, integrity, [])).toThrow(/symbolischen Verweis/);
    expect(readdirSync(outside)).toEqual([]);
  });
});
