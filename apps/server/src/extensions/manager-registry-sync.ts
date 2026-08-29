import {
  isExtensionLifecycleTransitionAllowed,
  type ExtensionHealth,
  type ExtensionManifestV1,
  type ExtensionRegistryDetail,
  type Sha256Integrity,
} from "@wrapt/extension-contracts";
import type { LocalExtensionCatalog } from "./catalog.js";
import type { ExtensionDatabase } from "./database.js";
import { AppError } from "../utils/errors.js";

export function syncCatalogUpdates(database: ExtensionDatabase, catalog: LocalExtensionCatalog | undefined): void {
  if (catalog === undefined) return;
  const updates: ExtensionRegistryDetail[] = [];
  for (const detail of database.listExtensions()) {
    const entry = catalog.get(detail.id);
    if (entry === undefined || detail.installedVersion === undefined || entry.package.version === detail.installedVersion) continue;
    updates.push({
      ...detail,
      availableVersion: entry.package.version,
      lifecycle: isExtensionLifecycleTransitionAllowed(detail.lifecycle, "update-available") ? "update-available" : detail.lifecycle,
    });
  }
  if (updates.length === 0) return;
  database.transaction(() => {
    for (const update of updates) database.upsertExtension(update);
    database.bumpRevision();
  });
}

export function reportHealth(database: ExtensionDatabase, extensionId: string, status: ExtensionHealth["status"]): void {
  const detail = database.getExtension(extensionId);
  if (detail === null) throw new AppError(404, "not-found", `Extension ${extensionId} ist nicht registriert.`);
  const health: ExtensionHealth = {
    status,
    checkedAt: new Date().toISOString(),
    consecutiveFailures: status === "unhealthy" ? detail.health.consecutiveFailures + 1 : 0,
  };
  database.transaction(() => {
    database.upsertExtension({ ...detail, health });
    database.bumpRevision();
  });
}

export function commitActivePackage(
  database: ExtensionDatabase,
  extensionId: string,
  manifest: ExtensionManifestV1,
  integrity: Sha256Integrity,
  afterCommit: () => void,
): void {
  const detail = database.getExtension(extensionId);
  if (detail === null || detail.lifecycle !== "active" || detail.source.kind !== "developer") {
    throw new AppError(409, "activation-failed", "Das lokale Paket ist nicht als aktive Developer-Runtime registriert.");
  }
  database.transaction(() => {
    database.upsertExtension({
      ...detail,
      name: manifest.name,
      description: manifest.description,
      publisher: manifest.publisher,
      manifest,
      installedVersion: manifest.version,
      activeVersion: manifest.version,
      activeAssetRevision: integrity,
    });
    database.bumpRevision();
  });
  afterCommit();
}
