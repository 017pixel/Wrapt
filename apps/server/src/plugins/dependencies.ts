import { join } from "node:path";
import { settings } from "../config/settings.js";
import type { LocalExtensionCatalog } from "../extensions/catalog.js";
import type { PluginRegistryBridge } from "./authoring.js";
import { PluginAuthoringService } from "./authoring.js";

export function createPluginAuthoring(catalog: LocalExtensionCatalog, registry?: PluginRegistryBridge): PluginAuthoringService {
  const examplesDirectory = join(settings.repositoryRoot, "extensions/plugins");
  const publishedDirectory = join(settings.dataDirectory, "extension-catalog");
  catalog.addSourceDirectory(publishedDirectory);
  catalog.addSourceDirectory(examplesDirectory);
  return new PluginAuthoringService(
    join(settings.dataDirectory, "plugin-drafts"),
    examplesDirectory,
    publishedDirectory,
    catalog,
    registry,
  );
}
