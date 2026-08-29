import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  extensionIdSchema,
  extensionManifestV1Schema,
  extensionPackageFilesSchema,
  extensionPermissionRequestsSchema,
  semanticVersionSchema,
  sha256IntegritySchema,
  type ExtensionManifestV1,
  type ExtensionPermissionRequests,
  type Sha256Integrity,
} from "@wrapt/extension-contracts";
import { z } from "zod";
import { AppError } from "../utils/errors.js";
import { packageInventory, type LocalExtensionCatalog } from "./catalog.js";

export interface ExtensionReleaseSlot {
  extensionId: string;
  version: string;
  packageIntegrity: Sha256Integrity;
  packageDirectory: string;
  manifest: ExtensionManifestV1;
  grantedPermissions: ExtensionPermissionRequests;
}

export interface ExtensionReleaseStoreOptions {
  onStep?: (step: "release-published") => void;
}

function slotDirectory(root: string, extensionId: string, version: string, integrity: Sha256Integrity): string {
  const safeId = extensionIdSchema.parse(extensionId);
  const safeVersion = semanticVersionSchema.parse(version);
  const safeIntegrity = sha256IntegritySchema.parse(integrity);
  return join(root, safeId, safeVersion, safeIntegrity.slice("sha256:".length));
}

function sameInventory(left: ReturnType<typeof packageInventory>, right: ReturnType<typeof packageInventory>): boolean {
  return left.integrity === right.integrity && JSON.stringify(left.files) === JSON.stringify(right.files);
}

function assertRegularDirectory(directory: string): void {
  const stats = lstatSync(directory);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new AppError(409, "integrity-mismatch", "Der Release-Slot enthält einen symbolischen Verweis.");
  }
}

function ensureDirectoryChain(root: string, segments: string[]): string {
  let current = root;
  assertRegularDirectory(current);
  for (const segment of segments) {
    current = join(current, segment);
    if (!existsSync(current)) mkdirSync(current, { recursive: false, mode: 0o700 });
    assertRegularDirectory(current);
  }
  return current;
}

const releaseMetadataSchema = z.strictObject({
  extensionId: extensionIdSchema,
  version: semanticVersionSchema,
  packageIntegrity: sha256IntegritySchema,
  manifest: extensionManifestV1Schema,
  grantedPermissions: extensionPermissionRequestsSchema,
  files: extensionPackageFilesSchema,
});

type ReleaseMetadata = z.infer<typeof releaseMetadataSchema>;

function metadataFor(
  manifest: ExtensionManifestV1,
  packageIntegrity: Sha256Integrity,
  grantedPermissions: ExtensionPermissionRequests,
  files: ReturnType<typeof packageInventory>["files"],
): ReleaseMetadata {
  return releaseMetadataSchema.parse({
    extensionId: manifest.id,
    version: manifest.version,
    packageIntegrity,
    manifest,
    grantedPermissions,
    files,
  });
}

export class ExtensionReleaseStore {
  constructor(
    private readonly rootDirectory: string,
    private readonly options: ExtensionReleaseStoreOptions = {},
  ) {
    mkdirSync(rootDirectory, { recursive: true, mode: 0o700 });
    assertRegularDirectory(rootDirectory);
  }

  stageCatalogPackage(
    catalog: LocalExtensionCatalog,
    manifest: ExtensionManifestV1,
    packageIntegrity: Sha256Integrity,
    grantedPermissions: ExtensionPermissionRequests,
  ): ExtensionReleaseSlot {
    const parsedManifest = extensionManifestV1Schema.parse(manifest);
    const parsedIntegrity = sha256IntegritySchema.parse(packageIntegrity);
    const parsedGrants = extensionPermissionRequestsSchema.parse(grantedPermissions);
    const entry = catalog.get(parsedManifest.id);
    const sourceDirectory = catalog.packageDirectoryOf(parsedManifest.id);
    if (
      entry === undefined
      || sourceDirectory === undefined
      || entry.manifest.version !== parsedManifest.version
      || entry.package.integrity !== parsedIntegrity
    ) {
      throw new AppError(409, "integrity-mismatch", "Das Catalog-Paket passt nicht zum Release-Slot.");
    }
    const expected = packageInventory(sourceDirectory);
    if (expected.integrity !== parsedIntegrity || JSON.stringify(expected.files) !== JSON.stringify(entry.package.files)) {
      throw new AppError(409, "integrity-mismatch", "Das Catalog-Paket wurde vor dem Staging verändert.");
    }
    const versionDirectory = ensureDirectoryChain(this.rootDirectory, [parsedManifest.id, parsedManifest.version]);
    const targetDirectory = join(versionDirectory, parsedIntegrity.slice("sha256:".length));
    const packageDirectory = join(targetDirectory, "package");
    if (existsSync(targetDirectory)) assertRegularDirectory(targetDirectory);
    if (existsSync(packageDirectory)) {
      assertRegularDirectory(packageDirectory);
      const actual = packageInventory(packageDirectory);
      if (!sameInventory(actual, expected)) {
        throw new AppError(409, "integrity-mismatch", "Der vorhandene Release-Slot ist beschädigt.");
      }
      this.writeMetadata(targetDirectory, metadataFor(parsedManifest, parsedIntegrity, parsedGrants, actual.files));
      return this.slot(packageDirectory, parsedManifest, parsedIntegrity, parsedGrants);
    }
    if (existsSync(targetDirectory)) {
      rmSync(targetDirectory, { recursive: true, force: true });
    }

    const stagingDirectory = join(this.rootDirectory, `.stage-${randomUUID()}`);
    const stagingPackage = join(stagingDirectory, "package");
    mkdirSync(stagingDirectory, { recursive: true, mode: 0o700 });
    try {
      cpSync(sourceDirectory, stagingPackage, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
      const staged = packageInventory(stagingPackage);
      if (!sameInventory(staged, expected)) {
        throw new AppError(409, "integrity-mismatch", "Das gestagte Paket weicht vom Catalog-Snapshot ab.");
      }
      this.writeMetadata(stagingDirectory, metadataFor(parsedManifest, parsedIntegrity, parsedGrants, staged.files));
      renameSync(stagingDirectory, targetDirectory);
      this.options.onStep?.("release-published");
    } catch (error) {
      rmSync(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
    return this.slot(packageDirectory, parsedManifest, parsedIntegrity, parsedGrants);
  }

  readSlot(extensionId: string, version: string, packageIntegrity: Sha256Integrity): ExtensionReleaseSlot | null {
    try {
      const safeId = extensionIdSchema.parse(extensionId);
      const safeVersion = semanticVersionSchema.parse(version);
      const safeIntegrity = sha256IntegritySchema.parse(packageIntegrity);
      const targetDirectory = slotDirectory(this.rootDirectory, safeId, safeVersion, safeIntegrity);
      const packageDirectory = join(targetDirectory, "package");
      const versionDirectory = join(this.rootDirectory, safeId, safeVersion);
      if (!existsSync(versionDirectory)) return null;
      assertRegularDirectory(this.rootDirectory);
      assertRegularDirectory(join(this.rootDirectory, safeId));
      assertRegularDirectory(versionDirectory);
      if (!existsSync(packageDirectory)) return null;
      assertRegularDirectory(targetDirectory);
      assertRegularDirectory(packageDirectory);
      const metadata = releaseMetadataSchema.parse(JSON.parse(readFileSync(join(targetDirectory, "release.json"), "utf8")) as unknown);
      const actual = packageInventory(packageDirectory);
      if (
        metadata.extensionId !== safeId
        || metadata.version !== safeVersion
        || metadata.packageIntegrity !== safeIntegrity
        || metadata.manifest.id !== safeId
        || metadata.manifest.version !== safeVersion
        || !sameInventory(actual, { integrity: safeIntegrity, files: metadata.files })
      ) return null;
      return this.slot(packageDirectory, metadata.manifest, safeIntegrity, metadata.grantedPermissions);
    } catch {
      return null;
    }
  }

  readVersion(extensionId: string, version: string): ExtensionReleaseSlot | null {
    try {
      const safeId = extensionIdSchema.parse(extensionId);
      const safeVersion = semanticVersionSchema.parse(version);
      const versionDirectory = join(this.rootDirectory, safeId, safeVersion);
      for (const entry of readdirSync(versionDirectory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^[0-9a-f]{64}$/.test(entry.name)) continue;
        const integrity = sha256IntegritySchema.parse(`sha256:${entry.name}`);
        const slot = this.readSlot(safeId, safeVersion, integrity);
        if (slot !== null) return slot;
      }
    } catch {
      return null;
    }
    return null;
  }

  private writeMetadata(directory: string, metadata: ReleaseMetadata): void {
    const metadataPath = join(directory, "release.json");
    const temporaryPath = join(directory, `.release-${randomUUID()}.json`);
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(metadata)}\n`, { mode: 0o600, flush: true });
      renameSync(temporaryPath, metadataPath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }

  private slot(
    packageDirectory: string,
    manifest: ExtensionManifestV1,
    packageIntegrity: Sha256Integrity,
    grantedPermissions: ExtensionPermissionRequests,
  ): ExtensionReleaseSlot {
    return { extensionId: manifest.id, version: manifest.version, packageIntegrity, packageDirectory, manifest, grantedPermissions };
  }
}
