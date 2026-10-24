import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isVersionCompatible, type ExtensionManagementRequest, type ExtensionManifestV1, type ExtensionRegistryDetail, type PluginRuntimeDescription, type Sha256Integrity } from "@wrapt/extension-contracts";
import type { PluginRuntimeConfig } from "../config/plugin-settings.js";
import type { LocalExtensionCatalog } from "../extensions/catalog.js";
import type { ExecutableExtensionRuntime } from "../extensions/executable-runtime.js";
import type { ExtensionReleaseSlot, ExtensionReleaseStore } from "../extensions/release-store.js";
import type { ExtensionRuntimeHost, ExtensionRuntimePointer } from "../extensions/runtime-host.js";
import { AppError } from "../utils/errors.js";
import { PluginProcess } from "./code-process.js";
import { PluginReleaseDataStore, type PluginReleaseData } from "./code-release-data.js";
import type { PluginCodeSourceStore } from "./code-source-store.js";

export interface ActiveCodePlugin {
  process: PluginProcess;
  slot: ExtensionReleaseSlot;
  data: PluginReleaseData;
  pointer: ExtensionRuntimePointer;
  description: PluginRuntimeDescription;
}

interface PendingActivation {
  previous: ActiveCodePlugin | undefined;
  previousData: PluginReleaseData | undefined;
  next: ActiveCodePlugin | undefined;
  data?: PluginReleaseData;
  committed: boolean;
}

export interface PluginRuntimeHostOptions {
  sources: PluginCodeSourceStore;
  catalog: LocalExtensionCatalog;
  releases: ExtensionReleaseStore;
  pointers: ExtensionRuntimeHost;
  dataDirectory: string;
  config: PluginRuntimeConfig;
  handle(pluginId: string, method: string, input: unknown): Promise<unknown> | unknown;
  changed?(): void;
  stopped?(id: string, integrity: string): void;
  log?(id: string, level: "info" | "error", message: string): void;
}

/** Nutzt dieselben Release-Slots und Registry-Operationen wie deklarative Extensions. */
export class PluginCodeRuntimeHost implements ExecutableExtensionRuntime {
  private readonly active = new Map<string, ActiveCodePlugin>();
  private readonly pending = new Map<string, PendingActivation>();
  private readonly data: PluginReleaseDataStore;
  private readonly cleanup = new Set<Promise<void>>();
  private readonly cleanupByPlugin = new Map<string, Set<Promise<void>>>();

  constructor(private readonly options: PluginRuntimeHostOptions) { this.data = new PluginReleaseDataStore(options.dataDirectory); }

  handles(id: string): boolean {
    try { this.options.sources.metadata(id); return true; }
    catch { return false; }
  }

  canActivate(manifest: ExtensionManifestV1, integrity: Sha256Integrity | undefined): boolean {
    if (this.options.config.safeMode || !integrity) return false;
    try {
      if (!this.options.sources.metadata(manifest.id).trusted) return false;
      const slot = this.options.releases.readSlot(manifest.id, manifest.version, integrity);
      return slot !== null && slot.manifest.trust === "developer" && existsSync(join(slot.packageDirectory, "plugin-code.json"));
    } catch { return false; }
  }

  list(): readonly ActiveCodePlugin[] { return [...this.active.values()].sort((a, b) => a.slot.extensionId.localeCompare(b.slot.extensionId)); }
  get(id: string): ActiveCodePlugin | undefined { return this.active.get(id); }

  matches(detail: ExtensionRegistryDetail): boolean {
    const active = this.active.get(detail.id);
    return active !== undefined && active.pointer.version === detail.activeVersion && active.pointer.packageIntegrity === detail.activeAssetRevision;
  }

  async prepare(request: ExtensionManagementRequest, current: ExtensionRegistryDetail | null): Promise<void> {
    if (!this.handles(request.extensionId)) return;
    await this.waitForCleanup(request.extensionId);
    const candidate = this.active.get(request.extensionId);
    const previous = candidate?.process.available ? candidate : undefined;
    if (candidate && !previous) this.active.delete(request.extensionId);
    const pending: PendingActivation = { previous, previousData: this.data.current(request.extensionId), next: undefined, committed: false };
    this.pending.set(request.extensionId, pending);
    if (previous) await previous.process.call("freeze");
    if (!this.shouldActivate(request, current)) return;
    const slot = this.slotFor(request, current);
    if (!this.canActivate(slot.manifest, slot.packageIntegrity)) throw new AppError(403, "permissions-denied", "Dieses persönliche Code-Plugin benötigt ausdrücklich Vollvertrauen. Im Safe Mode ist keine Aktivierung möglich.");
    const registration = this.options.sources.metadata(request.extensionId);
    if (request.operation === "install" && (request.source.kind !== "developer" || request.source.registrationId !== registration.registrationId)) throw new AppError(409, "operation-conflict", "Die Developer-Registrierung passt nicht zum persönlichen Plugin.");
    for (const [dependency, range] of Object.entries(slot.manifest.extensionDependencies ?? {})) {
      const provider = this.active.get(dependency);
      if (!provider || !isVersionCompatible(provider.slot.version, range)) throw new AppError(409, "activation-failed", `Die aktive Abhängigkeit ${dependency} (${range}) fehlt.`);
    }
    const data = this.data.allocate(slot);
    pending.data = data;
    const previousData = request.operation === "rollback" ? this.data.current(request.extensionId, slot.packageIntegrity)
      : previous?.data ?? this.data.current(request.extensionId, current?.source.kind === "developer" ? current.source.packageIntegrity : undefined);
    // Nach Freeze über eine frische Verbindung sichern. Damit hängt die Kopie
    // nicht von verbleibenden Statements der Plugin-Verbindung ab.
    if (previousData) await this.data.copy(previousData, data);
    const runtime: PluginProcess = new PluginProcess({
      id: slot.extensionId, version: slot.version,
      ...(slot.manifest.entrypoints.server ? { entrypoint: join(slot.packageDirectory, slot.manifest.entrypoints.server) } : {}),
      sourceDirectory: registration.sourceDirectory, dataDirectory: data.directory, releaseDirectory: slot.packageDirectory,
    }, {
      timeoutMs: this.options.config.requestTimeoutMs, shutdownTimeoutMs: this.options.config.shutdownTimeoutMs,
      handle: (method, input) => this.options.handle(slot.extensionId, method, { ...(input as object), staged: this.active.get(slot.extensionId)?.process !== runtime }),
      log: (level, message) => this.options.log?.(slot.extensionId, level, message),
      onExit: () => {
        if (this.active.get(slot.extensionId)?.process !== runtime) return;
        this.active.delete(slot.extensionId);
        this.options.pointers.deactivate(slot.extensionId);
        this.options.stopped?.(slot.extensionId, slot.packageIntegrity);
        this.options.changed?.();
      },
    });
    const description = await runtime.start();
    const now = new Date().toISOString();
    const pointer: ExtensionRuntimePointer = {
      extensionId: slot.manifest.id, version: slot.manifest.version, packageIntegrity: slot.packageIntegrity,
      entrypoint: slot.manifest.entrypoints.server ?? slot.manifest.entrypoints.ui!, runtimeId: randomUUID(), activatedAt: now,
      health: { status: "healthy", checkedAt: now },
    };
    pending.next = { process: runtime, slot, data, pointer, description };
    await runtime.call("activate");
  }

  finalize(detail: ExtensionRegistryDetail): ExtensionRegistryDetail {
    const pending = this.pending.get(detail.id);
    if (!pending) {
      if (detail.runtimeActive) throw new AppError(409, "activation-failed", "Die Code-Laufzeit wurde nicht vorbereitet.");
      return detail;
    }
    if (detail.runtimeActive) {
      const next = pending.next;
      if (!next || next.slot.version !== detail.installedVersion || detail.source.kind !== "developer" || next.slot.packageIntegrity !== detail.source.packageIntegrity) throw new AppError(409, "health-check-failed", "Die vorbereitete Code-Laufzeit passt nicht zum Registry-Stand.");
      detail = { ...detail, activeVersion: next.slot.manifest.version, activeAssetRevision: next.slot.packageIntegrity };
      this.options.pointers.restorePointer(detail.id, next.pointer);
      this.data.publish(detail.id, next.data);
      this.active.set(detail.id, next);
    } else {
      this.options.pointers.deactivate(detail.id);
      this.active.delete(detail.id);
    }
    pending.committed = true;
    return { ...detail, health: detail.runtimeActive ? { status: "healthy", checkedAt: pending.next!.pointer.health.checkedAt, consecutiveFailures: 0 } : { status: "stopped", consecutiveFailures: 0 } };
  }

  complete(id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (pending.previous) this.dispose(id, pending.previous.process);
    if (pending.next && !pending.committed) this.dispose(id, pending.next.process);
    this.options.changed?.();
  }

  rollback(id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    const stop = pending.next ? this.dispose(id, pending.next.process) : undefined;
    if (pending.previous?.process.available) {
      this.active.set(id, pending.previous);
      this.options.pointers.restorePointer(id, pending.previous.pointer);
      void pending.previous.process.call("thaw").catch(() => {
        if (this.active.get(id) === pending.previous) this.active.delete(id);
        this.options.pointers.deactivate(id);
        this.options.stopped?.(id, pending.previous!.slot.packageIntegrity);
      });
    } else {
      this.active.delete(id);
      this.options.pointers.deactivate(id);
    }
    if (pending.previousData) this.data.publish(id, pending.previousData);
    if (pending.data) {
      const data = pending.data;
      if (stop) this.track(id, stop.then(() => this.data.discard(id, data)));
      else this.data.discard(id, data);
    }
  }

  async close(): Promise<void> {
    for (const id of [...this.pending.keys()]) this.rollback(id);
    const processes = [...this.active.values()].map((runtime) => runtime.process);
    this.active.clear();
    await Promise.allSettled(processes.map((runtime) => runtime.stop()));
    await Promise.allSettled([...this.cleanup]);
  }

  private dispose(id: string, runtime: PluginProcess): Promise<void> {
    const run = runtime.stop().catch(() => undefined);
    this.track(id, run);
    return run;
  }

  private track(id: string, run: Promise<void>): void {
    this.cleanup.add(run);
    const pluginCleanup = this.cleanupByPlugin.get(id) ?? new Set<Promise<void>>();
    pluginCleanup.add(run);
    this.cleanupByPlugin.set(id, pluginCleanup);
    void run.then(() => {
      this.cleanup.delete(run);
      pluginCleanup.delete(run);
      if (pluginCleanup.size === 0) this.cleanupByPlugin.delete(id);
    });
  }

  private async waitForCleanup(id: string): Promise<void> {
    await Promise.allSettled([...(this.cleanupByPlugin.get(id) ?? [])]);
  }

  private shouldActivate(request: ExtensionManagementRequest, current: ExtensionRegistryDetail | null): boolean {
    if (request.operation === "install") return request.enableAfterInstall;
    if (request.operation === "rollback") return request.enableAfterRollback;
    if (request.operation === "update") return current?.desiredEnablement === "enabled";
    return request.operation === "enable" || request.operation === "reload";
  }

  private slotFor(request: ExtensionManagementRequest, current: ExtensionRegistryDetail | null): ExtensionReleaseSlot {
    if (request.operation === "install" || request.operation === "update") {
      const entry = this.options.catalog.get(request.extensionId);
      if (!entry) throw new AppError(404, "not-found", "Der lokale Code-Build fehlt.");
      const version = request.operation === "update" ? request.target.version : entry.manifest.version;
      const integrity = request.operation === "update" ? request.target.packageIntegrity : entry.package.integrity;
      const revision = request.operation === "update" ? request.target.catalogRevision : this.options.catalog.revision();
      const manifest = this.options.catalog.resolvePackage(request.extensionId, version, integrity, revision);
      return this.options.releases.stageCatalogPackage(this.options.catalog, manifest, integrity, []);
    }
    if (request.operation === "rollback") {
      const slot = current?.rollbackAssetRevision && current.rollbackVersion === request.targetVersion
        ? this.options.releases.readSlot(request.extensionId, request.targetVersion, current.rollbackAssetRevision)
        : this.options.releases.readVersion(request.extensionId, request.targetVersion);
      if (slot) return slot;
    }
    if (current?.source.kind === "developer" && current.source.packageIntegrity && current.installedVersion) {
      const slot = this.options.releases.readSlot(current.id, current.installedVersion, current.source.packageIntegrity);
      if (slot) return slot;
    }
    throw new AppError(409, "activation-failed", "Der verifizierte Code-Release-Slot wurde nicht gefunden.");
  }
}
