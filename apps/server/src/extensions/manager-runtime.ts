import {
  type ExtensionManifestV1,
  type ExtensionPermissionRequests,
  type ExtensionRegistryDetail,
  type ExtensionSource,
  type Sha256Integrity,
} from "@wrapt/extension-contracts";
import type { LocalExtensionCatalog } from "./catalog.js";
import type { ExtensionDatabase } from "./database.js";
import { runtimeCanActivate as baseRuntimeCanActivate } from "./manager-operations.js";
import type { ExtensionReleaseStore } from "./release-store.js";
import type { ExtensionRuntimeHost, ExtensionRuntimePointer } from "./runtime-host.js";

interface RuntimeCoordinatorOptions {
  database: ExtensionDatabase;
  getCatalog: () => LocalExtensionCatalog | undefined;
  releaseStore: ExtensionReleaseStore | undefined;
  runtimeHost: ExtensionRuntimeHost | undefined;
}

/** Kapselt Runtime-Pointer, Release-Handshake und Catalog-Staging. */
export class ExtensionRuntimeCoordinator {
  private readonly database: ExtensionDatabase;
  private readonly getCatalog: () => LocalExtensionCatalog | undefined;
  private readonly releaseStore: ExtensionReleaseStore | undefined;
  private readonly runtimeHost: ExtensionRuntimeHost | undefined;

  constructor(options: RuntimeCoordinatorOptions) {
    this.database = options.database;
    this.getCatalog = options.getCatalog;
    this.releaseStore = options.releaseStore;
    this.runtimeHost = options.runtimeHost;
  }

  canActivateSource(source: ExtensionSource, manifest: ExtensionManifestV1): boolean {
    const packagedSource = source.kind === "catalog" || source.kind === "local-package" || source.kind === "developer";
    const packageIntegrity = packagedSource ? source.packageIntegrity : undefined;
    const packagedUi = packageIntegrity !== undefined && manifest.entrypoints.ui !== undefined;
    if (packagedUi && packagedSource) {
      return this.runtimeHost?.canActivate(manifest, packageIntegrity) ?? baseRuntimeCanActivate(source);
    }
    return baseRuntimeCanActivate(source);
  }

  canActivateDetail(detail: ExtensionRegistryDetail): boolean {
    return this.canActivateSource(detail.source, detail.manifest);
  }

  finalize(detail: ExtensionRegistryDetail, previous: ExtensionRegistryDetail | null): ExtensionRegistryDetail {
    if (this.isHostedRuntime(detail) && detail.runtimeActive) {
      const runtime = this.runtimeHost!.activate(detail);
      return {
        ...detail,
        health: { status: "healthy", checkedAt: runtime.pointer.health.checkedAt, consecutiveFailures: 0 },
      };
    }
    if (this.isHostedRuntime(previous ?? detail) && previous?.runtimeActive && !detail.runtimeActive) {
      this.runtimeHost!.deactivate(detail.id);
      return { ...detail, health: { status: "stopped", consecutiveFailures: 0 } };
    }
    return detail;
  }

  readPointer(extensionId: string): ExtensionRuntimePointer | null {
    return this.runtimeHost?.readPointer(extensionId) ?? null;
  }

  restorePointer(extensionId: string, pointer: ExtensionRuntimePointer | null): void {
    try {
      this.runtimeHost?.restorePointer(extensionId, pointer);
    } catch {
      // Der Recovery-Eintrag darf nicht durch einen zweiten Pointer-Fehler verdeckt werden.
    }
  }

  /** Prüft beim Start Pointer, Release-Slot und Health erneut und fällt sonst zurück. */
  reconcile(): void {
    if (this.runtimeHost === undefined) return;
    for (const detail of this.database.listExtensions()) {
      const pointer = this.runtimeHost.readPointer(detail.id);
      if (!detail.runtimeActive) {
        if (pointer !== null) this.runtimeHost.deactivate(detail.id);
        continue;
      }
      if (this.isHostedRuntime(detail) && pointer !== null && this.runtimeHost.matches(detail)) continue;
      this.runtimeHost.deactivate(detail.id);
      const recovered = {
        ...detail,
        lifecycle: detail.desiredEnablement === "enabled" ? "installed" as const : "disabled" as const,
        activeVersion: undefined,
        activeAssetRevision: undefined,
        runtimeActive: false,
        health: { status: "stopped" as const, consecutiveFailures: 0 },
      };
      this.database.transaction(() => {
        this.database.upsertExtension(recovered);
        this.database.bumpRevision();
      });
    }
  }

  stageCatalogRelease(
    manifest: ExtensionManifestV1,
    packageIntegrity: Sha256Integrity,
    grantedPermissions: ExtensionPermissionRequests,
  ): void {
    const catalog = this.getCatalog();
    if (catalog === undefined || this.releaseStore === undefined) return;
    this.releaseStore.stageCatalogPackage(catalog, manifest, packageIntegrity, grantedPermissions);
  }

  private isHostedRuntime(detail: ExtensionRegistryDetail): boolean {
    const packageIntegrity = detail.source.kind === "catalog"
      || detail.source.kind === "local-package"
      || detail.source.kind === "developer"
      ? detail.source.packageIntegrity
      : undefined;
    return this.runtimeHost !== undefined
      && packageIntegrity !== undefined
      && detail.manifest.entrypoints.ui !== undefined
      && (detail.source.kind === "catalog" || detail.source.kind === "local-package" || detail.source.kind === "developer");
  }

}
