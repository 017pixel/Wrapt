import { join } from "node:path";
import { rmSync } from "node:fs";
import { extensionIdSchema, extensionManagementRequestSchema, type ExtensionManifestV1, type ExtensionRegistryDetail, type LocalPluginState } from "@wrapt/extension-contracts";
import type { ExtensionManager } from "../extensions/manager.js";
import type { LocalExtensionCatalog } from "../extensions/catalog.js";
import type { PluginRuntimeConfig } from "../config/plugin-settings.js";
import { AppError } from "../utils/errors.js";
import { buildPluginSourceInProcess } from "./code-build-process.js";
import type { PluginCodeSourceStore } from "./code-source-store.js";
import type { PluginCodeRuntimeHost } from "./code-runtime-host.js";

export interface CodeAuthoringOptions {
  sources: PluginCodeSourceStore;
  manager: ExtensionManager;
  catalog: LocalExtensionCatalog;
  runtime: PluginCodeRuntimeHost;
  repositoryRoot: string;
  outputRoot: string;
  config: PluginRuntimeConfig;
  log(id: string, message: string): void;
}

/** Quellen und Builds verwalten; alle Laufzeitzustände bleiben im ExtensionManager. */
export class PluginCodeAuthoring {
  private timer: NodeJS.Timeout | undefined;
  private watching = false;
  private readonly queues = new Map<string, Promise<unknown>>();
  constructor(readonly options: CodeAuthoringOptions) {}

  list(): Array<LocalPluginState & { runtime: ExtensionRegistryDetail | null }> {
    return this.options.sources.list().map((state) => ({ ...state, runtime: this.detail(state.id) }));
  }

  build(id: string): Promise<LocalPluginState> {
    return this.serial(id, async () => {
      const { sources } = this.options;
      const source = sources.source(id);
      try {
        const result = await buildPluginSourceInProcess(source, { repositoryRoot: this.options.repositoryRoot, outputDirectory: join(this.options.outputRoot, id), sourceDirectory: sources.metadata(id).sourceDirectory }, this.options.config.buildTimeoutMs);
        const failed = result.diagnostics.some((diagnostic) => diagnostic.severity === "error");
        sources.updateState(id, { diagnostics: result.diagnostics, ...(failed ? {} : { builtRevision: source.revision }) });
        if (!failed) this.discover(result.manifest);
      } catch (error) {
        sources.updateState(id, { diagnostics: [{ file: "plugin.json", severity: "error", message: error instanceof Error ? error.message : "Der Build ist fehlgeschlagen." }] });
      }
      return sources.list().find((state) => state.id === id)!;
    });
  }

  async activate(id: string, trust: boolean): Promise<ExtensionRegistryDetail> {
    if (trust) this.options.sources.updateState(id, { trusted: true });
    const state = await this.build(id);
    if (state.builtRevision !== state.sourceRevision || state.diagnostics.some((entry) => entry.severity === "error")) throw new AppError(422, "validation-failed", "Der Plugin-Build enthält Fehler. Die bisherige Version bleibt aktiv.");
    const { manager, catalog, sources } = this.options;
    const current = this.detail(id);
    const entry = catalog.get(id)!;
    const expectedRevision = manager.snapshot().revision;
    if (!current?.installedVersion) {
      await manager.dispatch(extensionManagementRequestSchema.parse({ operation: "install", extensionId: id, expectedRevision, source: { kind: "developer", registrationId: sources.metadata(id).registrationId, packageIntegrity: entry.package.integrity }, enableAfterInstall: true }));
    } else if (current.source.kind === "developer" && current.source.packageIntegrity !== entry.package.integrity) {
      await manager.dispatch(extensionManagementRequestSchema.parse({ operation: "update", extensionId: id, expectedRevision, target: { providerId: entry.providerId, catalogRevision: catalog.revision(), version: entry.package.version, packageIntegrity: entry.package.integrity } }));
      if (manager.detail(id).desiredEnablement !== "enabled") await this.action(id, "enable");
    } else await this.action(id, current.runtimeActive ? "reload" : "enable");
    return manager.detail(id);
  }

  async action(id: string, action: "enable" | "disable" | "reload" | "uninstall" | "rollback" | "update", targetVersion?: string): Promise<ExtensionRegistryDetail> {
    if (action === "update") return this.activate(id, false);
    const { manager } = this.options;
    const base = { extensionId: id, expectedRevision: manager.snapshot().revision };
    if (action === "rollback") {
      const version = targetVersion ?? manager.detail(id).rollbackVersion;
      if (!version) throw new AppError(409, "operation-conflict", "Es gibt keinen vorherigen Release.");
      await manager.dispatch(extensionManagementRequestSchema.parse({ ...base, operation: "rollback", targetVersion: version, enableAfterRollback: true }));
    } else if (action === "uninstall") await manager.dispatch(extensionManagementRequestSchema.parse({ ...base, operation: action, data: "retain" }));
    else await manager.dispatch(extensionManagementRequestSchema.parse({ ...base, operation: action }));
    return manager.detail(id);
  }

  async remove(id: string): Promise<void> {
    const state = this.options.sources.metadata(id);
    if (this.detail(id)?.installedVersion) await this.action(id, "uninstall");
    // Externe Quellordner und persönliche Laufzeitdaten bleiben erhalten.
    rmSync(this.options.sources.pluginDirectory(state.id), { recursive: true, force: true });
    rmSync(join(this.options.outputRoot, state.id), { recursive: true, force: true });
    this.options.catalog.refresh();
  }

  async start(): Promise<void> {
    if (!this.options.config.safeMode) {
      const pending = new Map(this.options.sources.list().filter((state) => state.trusted && this.detail(state.id)?.desiredEnablement === "enabled").map((state) => [state.id, state]));
      while (pending.size > 0) {
        let progress = false;
        for (const id of pending.keys()) {
          try {
            const dependencies = this.options.sources.source(id).definition.dependencies;
            if (Object.keys(dependencies).some((dependency) => pending.has(extensionIdSchema.parse(dependency)))) continue;
            await this.action(id, "enable");
          } catch (error) { this.options.log(id, error instanceof Error ? error.message : "Wiederherstellung fehlgeschlagen"); }
          pending.delete(id); progress = true;
        }
        if (!progress) { for (const id of pending.keys()) this.options.log(id, "Zyklische Plugin-Abhängigkeit verhindert den Start."); break; }
      }
    }
    this.timer = setInterval(() => { void this.watch(); }, this.options.config.sourceWatchIntervalMs);
    this.timer.unref();
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await Promise.allSettled([...this.queues.values()]);
  }

  private discover(manifest: ExtensionManifestV1): void {
    const { catalog, manager, sources } = this.options;
    catalog.refresh();
    const entry = catalog.get(manifest.id);
    if (!entry) throw new AppError(422, "staging-failed", "Der verifizierte lokale Build konnte nicht gelesen werden.");
    manager.registerDiscovered(manifest, { kind: "developer", registrationId: sources.metadata(manifest.id).registrationId, packageIntegrity: entry.package.integrity });
    manager.syncCatalogUpdates();
  }

  private detail(id: string): ExtensionRegistryDetail | null {
    try { return this.options.manager.detail(id); } catch { return null; }
  }

  private async watch(): Promise<void> {
    if (this.watching) return;
    this.watching = true;
    try {
      for (const state of this.options.sources.list().filter((entry) => entry.development)) {
        try {
          const source = this.options.sources.source(state.id);
          if (source.revision === state.builtRevision || state.diagnostics.length > 0 && source.revision === state.sourceRevision) continue;
          if (this.detail(state.id)?.runtimeActive) await this.activate(state.id, false);
          else await this.build(state.id);
        } catch (error) { this.options.log(state.id, error instanceof Error ? error.message : "Entwicklungs-Reload fehlgeschlagen"); }
      }
    } finally { this.watching = false; }
  }

  private serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(action);
    this.queues.set(id, run);
    void run.finally(() => { if (this.queues.get(id) === run) this.queues.delete(id); }).catch(() => undefined);
    return run;
  }
}
