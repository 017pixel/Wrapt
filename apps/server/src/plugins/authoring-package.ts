import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { type PluginDraft, type PluginDraftContent } from "@wrapt/contracts";
import { extensionPermissionRequestSchema, type ExtensionPermissionRequest } from "@wrapt/extension-contracts";
import { replacePackageDirectory } from "./package-directory.js";

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

function permissionRequests(draft: PluginDraft): ExtensionPermissionRequest[] {
  return draft.wizard.permissions.map((permission) => extensionPermissionRequestSchema.parse({ permission }));
}

function surfaceEntries(draft: PluginDraft, surface: PluginDraftContent["surfaces"][number]) {
  const explicit = draft.surfaceContributions.filter((item) => item.surface === surface);
  if (explicit.length > 0) return explicit;
  if (!draft.surfaces.includes(surface)) return [];
  return [{
    id: `${surface}-main`,
    surface,
    title: draft.name,
    description: draft.description,
    mobileBehavior: draft.wizard.mobileBehavior === "responsive" ? "same" : draft.wizard.mobileBehavior,
    token: "accent" as const,
  }];
}

export async function writePluginPackage(publishedDirectory: string, draft: PluginDraft): Promise<string> {
  const extensionId = `wrapt.local.${draft.slug}`;
  const finalPackageDirectory = join(publishedDirectory, draft.slug);
  const routePath = draft.surfaces.includes("sidebar") ? `/plugins/tool/${draft.slug}` : draft.routePath;
  const pageId = `${extensionId}.page.main`;
  const routeId = `${extensionId}.route.main`;
  const commands: Array<Record<string, unknown>> = [];
  const commandFor = (id: string, title: string, description: string) => {
    const commandId = `${extensionId}.command.${id}`;
    if (!commands.some((command) => command.id === commandId)) commands.push({ id: commandId, title, description, category: draft.category });
    return commandId;
  };
  const topbarEntries = surfaceEntries(draft, "topbar");
  const bottomBarEntries = surfaceEntries(draft, "bottom-bar");
  const dashboardEntries = surfaceEntries(draft, "dashboard");
  const contextEntries = surfaceEntries(draft, "context-menu");
  const orbitEntries = surfaceEntries(draft, "orbit");
  const contributes: Record<string, unknown> = {
    pages: [{ id: pageId, title: draft.name, description: draft.description }],
    routes: [{ id: routeId, pageId, path: routePath, shell: "standard", persistent: true, prefetch: "idle", projectContext: false, topbar: true, breadcrumbs: true, standaloneActions: false, mobileNavigation: draft.surfaces.includes("sidebar") }],
  };
  if (draft.surfaces.includes("sidebar")) contributes.navigation = [{ id: `${extensionId}.navigation.main`, routeId, label: draft.name, description: draft.description, group: "tools", order: 500, visibleByDefault: true }];
  if (topbarEntries.length > 0) contributes.topbar = topbarEntries.map((entry, index) => ({ id: `${extensionId}.topbar.${entry.id}`, kind: "action", routeId, commandId: commandFor(`topbar-${entry.id}`, entry.title, entry.description), placement: "secondary", order: index * 10, priority: 50, presentation: "label", compact: "hide" }));
  if (bottomBarEntries.length > 0) contributes.statusBar = bottomBarEntries.map((entry, index) => ({ id: `${extensionId}.status-bar.${entry.id}`, kind: "text", title: entry.title, provider: `${extensionId}.status-provider.${entry.id}`, alignment: "right", order: index * 10, priority: 50, compact: "value" }));
  if (dashboardEntries.length > 0) contributes.dashboard = dashboardEntries.map((entry, index) => ({ id: `${extensionId}.dashboard.${entry.id}`, kind: "card", title: entry.title, description: entry.description, defaultSize: "medium", order: index * 10, projectContext: false, visibleByDefault: true, provider: `${extensionId}.dashboard-provider.${entry.id}`, refresh: { mode: "on-demand" } }));
  if (orbitEntries.length > 0) contributes.orbit = orbitEntries.map((entry, index) => ({ id: `${extensionId}.orbit.${entry.id}`, title: entry.title, description: entry.description, stateVersion: index + 1, stateSchema: `./schemas/${draft.slug}-${entry.id}.json`, defaultSize: { width: 420, height: 280 }, resizable: true, projectContext: false, inspector: true, connections: "bidirectional", visibleByDefault: true }));
  if (contextEntries.length > 0) contributes.contextMenus = contextEntries.map((entry, index) => ({ id: `${extensionId}.context-menu.${entry.id}`, surface: "host.context-menu.project", commandId: commandFor(`context-${entry.id}`, entry.title, entry.description), group: "run", order: index * 10 }));
  if (commands.length > 0) contributes.commands = commands;
  const manifest = {
    manifestVersion: 1,
    id: extensionId,
    name: draft.name,
    version: draft.version,
    publisher: draft.publisher,
    description: draft.description,
    license: "MIT",
    engines: { wrapt: ">=0.98.0", extensionApi: ">=1.0.0" },
    trust: "catalog-first-party",
    entrypoints: { ui: "./index.js" },
    permissions: permissionRequests(draft),
    activationEvents: [],
    contributes,
  };
  await replacePackageDirectory(finalPackageDirectory, async (packageDirectory) => {
    await writeJsonAtomic(join(packageDirectory, "extension.json"), manifest);
    await writeJsonAtomic(join(packageDirectory, "plugin.json"), draft);
    for (const file of draft.packageFiles) {
      if (["extension.json", "plugin.json", "index.js"].includes(file.path)) continue;
      const filePath = join(packageDirectory, file.path);
      await mkdir(join(packageDirectory, dirname(file.path)), { recursive: true, mode: 0o700 });
      await writeFile(filePath, file.content, { encoding: "utf8", mode: 0o600 });
    }
    for (const entry of orbitEntries) {
      const statePath = join(packageDirectory, "schemas", `${draft.slug}-${entry.id}.json`);
      await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
      await writeJsonAtomic(statePath, { type: "object", additionalProperties: true });
    }
    await writeFile(join(packageDirectory, "index.js"), `export default ${JSON.stringify({ extensionId, routePath, pageMode: draft.pageMode, surfaces: draft.surfaces, activationStatus: draft.activationStatus }, null, 2)};\n`, { encoding: "utf8", mode: 0o600 });
  });
  return extensionId;
}
