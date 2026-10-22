import { join } from "node:path";
import { settings } from "../config/settings.js";
import type { ExtensionManager } from "../extensions/manager.js";
import type { ExtensionDatabase } from "../extensions/database.js";
import type { ExtensionReleaseStore } from "../extensions/release-store.js";
import type { ExtensionRuntimeHost } from "../extensions/runtime-host.js";
import type { LocalExtensionCatalog } from "../extensions/catalog.js";
import { PluginCodeSourceStore } from "./code-source-store.js";
import { PluginCodeRuntimeHost } from "./code-runtime-host.js";
import { PluginHostApi } from "./code-host-api.js";
import { PluginRuntimeHub } from "./code-runtime-hub.js";
import { PluginCodeAuthoring } from "./code-authoring.js";
import type { PluginRuntimeConfig } from "../config/plugin-settings.js";

export function createPluginCodePlatform(deps: { manager: ExtensionManager; database: ExtensionDatabase; releases: ExtensionReleaseStore; pointers: ExtensionRuntimeHost; catalog: LocalExtensionCatalog }, paths: { dataDirectory: string; repositoryRoot: string; config: PluginRuntimeConfig } = { dataDirectory: settings.dataDirectory, repositoryRoot: settings.repositoryRoot, config: settings.pluginRuntime }) {
  const sources = new PluginCodeSourceStore(join(paths.dataDirectory, "plugin-sources"));
  const outputRoot = join(paths.dataDirectory, "extension-catalog");
  deps.catalog.addSourceDirectory(outputRoot, { effectiveTrust: "developer", include: (manifest) => manifest.trust === "developer" });
  const api = new PluginHostApi();
  const hub: PluginRuntimeHub = new PluginRuntimeHub(api, () => runtime?.list() ?? [], join(paths.dataDirectory, "plugin-jobs.sqlite"), paths.config);
  const runtime: PluginCodeRuntimeHost = new PluginCodeRuntimeHost({
    sources, catalog: deps.catalog, releases: deps.releases, pointers: deps.pointers,
    dataDirectory: join(paths.dataDirectory, "plugin-data"), config: paths.config,
    handle: (id, method, input) => hub.handle(id, method, input), changed: () => hub.changed(),
    log: (id, level, message) => hub.log(id, level, message),
    stopped: (id, integrity) => {
      const current = deps.database.getExtension(id);
      if (!current || current.activeAssetRevision !== integrity) return;
      deps.database.transaction(() => {
        const next = { ...current };
        delete next.activeVersion;
        delete next.activeAssetRevision;
        deps.database.upsertExtension({ ...next, lifecycle: "crashed", runtimeActive: false, health: { status: "unhealthy", checkedAt: new Date().toISOString(), consecutiveFailures: current.health.consecutiveFailures + 1 } });
        deps.database.bumpRevision();
      });
    },
  });
  deps.manager.attachExecutableRuntime(runtime);
  const authoring = new PluginCodeAuthoring({ sources, manager: deps.manager, catalog: deps.catalog, runtime, repositoryRoot: paths.repositoryRoot, outputRoot, config: paths.config, log: (id, message) => hub.log(id, "error", message) });
  return { sources, runtime, hub, api, authoring, async close() { await authoring.close(); await hub.close(); await runtime.close(); } };
}

export type PluginCodePlatform = ReturnType<typeof createPluginCodePlatform>;
