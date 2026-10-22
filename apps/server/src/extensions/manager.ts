import { randomUUID } from "node:crypto";
import {
  extensionIdSchema,
  extensionManifestV1Schema,
  extensionPublicErrorCodes,
  type ExtensionManagementAccepted,
  type ExtensionManagementOperation,
  type ExtensionManagementRequest,
  type ExtensionManifestV1,
  type ExtensionPublicError,
  type ExtensionRegistryDetail,
  type ExtensionRegistrySnapshot,
  type ExtensionRegistrySummary,
  type ExtensionSource,
} from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import { writeExtensionDatabaseBackup } from "./backup.js";
import type { LocalExtensionCatalog } from "./catalog.js";
import type { ExtensionDatabase } from "./database.js";
import { allowedOperationsFor, runtimeCanActivate as baseRuntimeCanActivate } from "./manager-operations.js";
import { LocalPluginRegistry } from "./local-plugin-registry.js";
import { ExtensionRuntimeCoordinator } from "./manager-runtime.js";
import { applyExtensionOperation } from "./manager-apply.js";
import type { ExecutableExtensionRuntime } from "./executable-runtime.js";
import { commitActivePackage, reportHealth, syncCatalogUpdates } from "./manager-registry-sync.js";
import { withOpenReview } from "./manager-views.js";
import type { ExtensionReleaseStore } from "./release-store.js";
import type { ExtensionRuntimeHost } from "./runtime-host.js";

interface DiscoveredExtension {
  manifest: ExtensionManifestV1;
  source: ExtensionSource;
}

const errorFor = (code: ExtensionPublicError["code"]): ExtensionPublicError => ({
  code,
  occurredAt: new Date().toISOString(),
});

function summaryOf(detail: ExtensionRegistryDetail, canActivate = baseRuntimeCanActivate(detail.source)): ExtensionRegistrySummary {
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    publisher: detail.publisher,
    source: detail.source,
    effectiveTrust: detail.effectiveTrust,
    lifecycle: detail.lifecycle,
    desiredEnablement: detail.desiredEnablement,
    runtimeActive: detail.runtimeActive,
    required: detail.required,
    ...(detail.installedVersion !== undefined ? { installedVersion: detail.installedVersion } : {}),
    ...(detail.activeVersion !== undefined ? { activeVersion: detail.activeVersion } : {}),
    ...(detail.availableVersion !== undefined ? { availableVersion: detail.availableVersion } : {}),
    ...(detail.rollbackVersion !== undefined ? { rollbackVersion: detail.rollbackVersion } : {}),
    ...(detail.rollbackAssetRevision !== undefined ? { rollbackAssetRevision: detail.rollbackAssetRevision } : {}),
    ...(detail.activeAssetRevision !== undefined
      ? { activeAssetRevision: detail.activeAssetRevision }
      : {}),
    allowedOperations: allowedOperationsFor(detail, canActivate),
    ...(detail.lifecycle === "permissions-pending" && detail.permissionReview !== undefined
      ? { permissionReview: detail.permissionReview }
      : {}),
  };
}
/**
 * Serverseitiger Extension Manager. Er ist die einzige Schreibinstanz der
 * Registry, serialisiert Operationen je Extension, prüft die erwartete
 * Revision und führt alle Lifecycle-Übergänge über die geschlossene
 * Zustandsmaschine. Die tatsächliche Code-Aktivierung der Entrypoints folgt
 * Paketbasierte UI-Aktivierung läuft ausschließlich über den verifizierten
 * Release-Slot und den injizierten Runtime-Host. Serverseitige Entrypoints
 * ohne Sandbox bleiben fail-closed.
 */
export class ExtensionManager {
  private readonly discovered = new Map<string, DiscoveredExtension>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private catalog: LocalExtensionCatalog | undefined;
  private localPluginCatalog: LocalExtensionCatalog | undefined;
  private readonly localPlugins: LocalPluginRegistry;
  private readonly runtime: ExtensionRuntimeCoordinator;

  constructor(
    private readonly database: ExtensionDatabase,
    private readonly backupDirectory?: string,
    private readonly releaseStore?: ExtensionReleaseStore,
    runtimeHost?: ExtensionRuntimeHost,
  ) {
    this.runtime = new ExtensionRuntimeCoordinator({
      database,
      getCatalog: () => this.localPluginCatalog ?? this.catalog,
      releaseStore,
      runtimeHost,
    });
    this.localPlugins = new LocalPluginRegistry({
      database,
      catalog: () => this.localPluginCatalog ?? this.catalog,
      register: (manifest, source) => this.registerDiscovered(manifest, source),
      dispatch: (request) => this.dispatch(request),
      commitActivePackage: (extensionId, manifest, integrity) => commitActivePackage(
        database,
        extensionId,
        manifest,
        integrity,
        () => this.backupRegistry(),
      ),
    });
  }

  attachCatalog(catalog: LocalExtensionCatalog): void {
    this.catalog = catalog;
  }

  attachLocalPluginCatalog(catalog: LocalExtensionCatalog): void { this.localPluginCatalog = catalog; }

  attachExecutableRuntime(runtime: ExecutableExtensionRuntime): void { this.runtime.attachExecutableRuntime(runtime); }

  /** Prüft beim Start Pointer, Release-Slot und Health erneut und fällt sonst zurück. */
  reconcileRuntime(): void {
    this.runtime.reconcile();
    this.backupRegistry();
  }

  registerDiscovered(manifest: ExtensionManifestV1, source: ExtensionSource): void {
    const parsed = extensionManifestV1Schema.parse(manifest);
    this.discovered.set(parsed.id, { manifest: parsed, source });
  }

  /**
   * Synchronisiert ein vom Plugin-Authoring erzeugtes, permissionloses
   * Declarative-Plugin mit der Registry. Der Frontend-Runtime darf lokale
   * Inhalte erst nach diesem erfolgreichen Registry-Fakt anzeigen.
   */
  async syncLocalPlugin(extensionId: string): Promise<void> {
    await this.localPlugins.sync(extensionIdSchema.parse(extensionId));
  }

  async disableLocalPlugin(extensionId: string): Promise<void> {
    await this.localPlugins.disable(extensionIdSchema.parse(extensionId), (request) => this.dispatch(request));
  }

  async uninstallLocalPlugin(extensionId: string): Promise<void> {
    await this.localPlugins.uninstall(extensionIdSchema.parse(extensionId), (request) => this.dispatch(request));
  }

  snapshot(): ExtensionRegistrySnapshot {
    return {
      revision: this.database.revision(),
      generatedAt: new Date().toISOString(),
      extensions: this.database
        .listExtensions()
        .map((detail) => {
          const open = withOpenReview(this.database, detail);
          return summaryOf(open, this.runtime.canActivateDetail(open));
        }),
    };
  }

  detail(extensionId: string): ExtensionRegistryDetail {
    const detail = this.database.getExtension(extensionId);
    if (detail === null) {
      throw new AppError(404, "not-found", `Extension ${extensionId} ist nicht registriert.`);
    }
    const lastOperation = this.database.lastOperation(extensionId);
    const open = withOpenReview(this.database, detail);
    const derived = { ...open, allowedOperations: allowedOperationsFor(open, this.runtime.canActivateDetail(open)) };
    return {
      ...derived,
      ...(lastOperation !== undefined ? { lastOperation } : {}),
      ...(detail.lastError !== undefined ? { lastError: detail.lastError } : {}),
    };
  }

  syncCatalogUpdates(): void {
    syncCatalogUpdates(this.database, this.catalog);
    if (this.localPluginCatalog !== this.catalog) syncCatalogUpdates(this.database, this.localPluginCatalog);
    this.backupRegistry();
  }

  private backupRegistry(): void {
    if (this.backupDirectory === undefined) return;
    try {
      writeExtensionDatabaseBackup(this.database, this.backupDirectory, this.database.revision());
    } catch {
      // Die Registry ist bereits dauerhaft geschrieben. Ein späterer Start
      // versucht den nächsten Snapshot erneut; ein Backupfehler darf keinen
      // erfolgreichen Lifecycle-Request rückwirkend fehlschlagen lassen.
    }
  }

  reportHealth(extensionId: string, status: ExtensionRegistryDetail["health"]["status"]): void {
    reportHealth(this.database, extensionId, status);
  }

  dispatch(request: ExtensionManagementRequest): Promise<ExtensionManagementAccepted> {
    const extensionId = request.extensionId;
    const previous = this.queues.get(extensionId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => this.execute(request));
    this.queues.set(extensionId, run);
    void run.then(
      () => { if (this.queues.get(extensionId) === run) this.queues.delete(extensionId); },
      () => { if (this.queues.get(extensionId) === run) this.queues.delete(extensionId); },
    );
    return run as Promise<ExtensionManagementAccepted>;
  }

  private async execute(request: ExtensionManagementRequest): Promise<ExtensionManagementAccepted> {
    const operationId = randomUUID();
    const queued: ExtensionManagementOperation = {
      id: operationId,
      type: request.operation,
      status: "queued",
      requestedAt: new Date().toISOString(),
    };
    let current: ExtensionRegistryDetail | null = null;
    let operation = queued;
    let started = false;
    const runtimeBefore = this.runtime.readPointer(request.extensionId);
    try {
      current = this.database.getExtension(request.extensionId);
      if (request.expectedRevision !== this.database.revision()) throw new AppError(409, "operation-conflict", "Die Registry wurde inzwischen geändert; bitte erneut laden.");
      await this.runtime.prepare(request, current);
      const accepted = this.database.transaction(() => {
        current = this.database.getExtension(request.extensionId);
        if (current !== null) this.database.addOperation(request.extensionId, queued);

        if (request.expectedRevision !== this.database.revision()) {
          throw new AppError(
            409,
            "operation-conflict",
            "Die Registry wurde inzwischen geändert; bitte erneut laden.",
          );
        }

        operation = { ...queued, status: "running", startedAt: new Date().toISOString() };
        started = true;
        if (current !== null) this.database.updateOperation(operation);

        const catalog = current?.source.kind === "developer" ? this.localPluginCatalog ?? this.catalog : this.catalog;
        const applied = applyExtensionOperation({ database: this.database, catalog, discovered: this.discovered, runtime: this.runtime, releaseStore: this.releaseStore }, request, current);
        const result = applied.detail === null
          ? applied
          : { ...applied, detail: this.runtime.finalize(applied.detail, current) };
        const completed: ExtensionManagementOperation = {
          ...operation,
          status: "succeeded",
          completedAt: new Date().toISOString(),
        };
        if (result.detail !== null) {
          this.database.upsertExtension(result.detail);
          if (result.review !== undefined) this.database.addReview(request.extensionId, result.review);
          if (current !== null) this.database.updateOperation(completed);
          else this.database.addOperation(request.extensionId, completed);
          this.database.bumpRevision();
        }
        return {
          revision: this.database.revision(),
          operation: completed,
          extension: summaryOf(
            withOpenReview(this.database, result.detail ?? this.database.getExtension(request.extensionId)!),
            result.detail === null ? undefined : this.runtime.canActivateDetail(result.detail),
          ),
        };
      });
      // Catalog-Updates schreiben ebenfalls Registry-Zeilen und starten dafür
      // eine eigene Transaktion. Das darf nicht innerhalb des gerade
      // abgeschlossenen Zustandsübergangs passieren: SQLite unterstützt keine
      // verschachtelten BEGIN-Statements. Die Rückgabeversion wird danach
      // erneut gelesen, damit ein durch den Scan entdecktes Update sichtbar ist.
      this.syncCatalogUpdates();
      this.runtime.complete(request.extensionId);
      return { ...accepted, revision: this.database.revision() };
    } catch (error) {
      this.runtime.restorePointer(request.extensionId, runtimeBefore);
      const publicError: ExtensionPublicError =
        error instanceof AppError && extensionPublicErrorCodes.includes(error.code as (typeof extensionPublicErrorCodes)[number])
          ? errorFor(error.code as ExtensionPublicError["code"])
          : errorFor("internal-error");
      const failed: ExtensionManagementOperation = {
        ...operation,
        status: "failed",
        ...(started ? { startedAt: operation.startedAt } : {}),
        completedAt: new Date().toISOString(),
        error: publicError,
      };
      if (current !== null) {
        this.database.transaction(() => {
          // Die Erfolgs-/Running-Transaktion wurde vollständig zurückgerollt;
          // der fehlgeschlagene Journal-Eintrag wird atomar neu geschrieben.
          this.database.addOperation(request.extensionId, failed);
          this.database.upsertExtension({ ...current!, lastError: publicError });
          this.database.bumpRevision();
        });
        this.runtime.reconcile(request.extensionId);
      }
      throw error;
    }
  }
}
