import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  pluginDraftContentSchema,
  pluginDraftSchema,
  pluginExampleSchema,
  type PluginDraft,
  type PluginDraftContent,
} from "@wrapt/contracts";
import {
  extensionPermissionRequestSchema,
  type ExtensionPermissionRequest,
} from "@wrapt/extension-contracts";
import type { LocalExtensionCatalog } from "../extensions/catalog.js";
import { AppError } from "../utils/errors.js";
import { contentOf } from "./draft-content.js";
import { removeOwnedPluginPackage } from "./draft-package-ownership.js";
import { nextAvailablePluginSlug, replaceGeneratedPluginSlug } from "./draft-slugs.js";
import { replacePackageDirectory } from "./package-directory.js";

const draftIdSchema = /^[0-9a-f-]{36}$/i;

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function permissionRequests(draft: PluginDraft): ExtensionPermissionRequest[] {
  return draft.wizard.permissions.map((permission) =>
    extensionPermissionRequestSchema.parse({ permission }),
  );
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

/** Lokale Drafts und die versionierten Beispielpakete des Beta-Stores. */
export class PluginAuthoringService {
  constructor(
    private readonly draftDirectory: string,
    private readonly examplesDirectory: string,
    private readonly publishedDirectory: string,
    private readonly catalog: LocalExtensionCatalog,
  ) {}

  async initialize(): Promise<void> {
    await mkdir(this.draftDirectory, { recursive: true, mode: 0o700 });
    await mkdir(this.publishedDirectory, { recursive: true, mode: 0o700 });
  }

  async listExamples() {
    try {
      const entries = await readdir(this.examplesDirectory, { withFileTypes: true });
      const examples = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
        try {
          const content = pluginDraftContentSchema.parse(
            await readJson(join(this.examplesDirectory, entry.name, "plugin.json")),
          );
          return pluginExampleSchema.parse({
            ...content,
            exampleId: entry.name,
            sourceDirectory: `extensions/plugins/${entry.name}`,
          });
        } catch {
          return null;
        }
      }));
      return examples.filter((example): example is NonNullable<typeof example> => example !== null)
        .sort((left, right) => left.exampleId.localeCompare(right.exampleId));
    } catch {
      return [];
    }
  }

  async listDrafts(): Promise<PluginDraft[]> {
    await this.initialize();
    const entries = await readdir(this.draftDirectory, { withFileTypes: true });
    const drafts = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map(async (entry) => {
      try {
        return pluginDraftSchema.parse(await readJson(join(this.draftDirectory, entry.name)));
      } catch {
        return null;
      }
    }));
    return drafts.filter((draft): draft is PluginDraft => draft !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getDraft(id: string): Promise<PluginDraft> {
    const path = this.pathFor(id);
    try {
      return pluginDraftSchema.parse(await readJson(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new AppError(404, "not-found", "Der Plugin-Entwurf wurde nicht gefunden.");
      }
      throw error;
    }
  }

  async createDraft(content: unknown): Promise<PluginDraft> {
    const parsed = pluginDraftContentSchema.parse(content);
    const occupied = new Set((await this.listDrafts()).map((draft) => draft.slug));
    const uniqueContent = replaceGeneratedPluginSlug(parsed, nextAvailablePluginSlug(parsed.slug, occupied));
    const now = new Date().toISOString();
    const draft = pluginDraftSchema.parse({
      ...uniqueContent,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    await this.initialize();
    await writeJsonAtomic(this.pathFor(draft.id), draft);
    return draft;
  }

  async updateDraft(id: string, content: unknown): Promise<PluginDraft> {
    return this.persistDraft(id, content, false);
  }

  private async persistDraft(id: string, content: unknown, allowLifecycle: boolean): Promise<PluginDraft> {
    const current = await this.getDraft(id);
    const input = pluginDraftContentSchema.parse(content);
    const parsed = allowLifecycle ? input : {
      ...input,
      activationStatus: current.activationStatus,
      status: current.status,
    };
    if (parsed.slug !== current.slug && current.activationStatus === "active") {
      throw new AppError(409, "PLUGIN_ACTIVE_SLUG_CHANGE", "Deaktiviere das Plugin, bevor du seine Slug änderst.");
    }
    if (
      parsed.slug !== current.slug
      && (await this.listDrafts()).some((draft) => draft.id !== id && draft.slug === parsed.slug)
    ) {
      throw new AppError(409, "PLUGIN_SLUG_CONFLICT", `Die Plugin-Slug „${parsed.slug}“ wird bereits verwendet.`);
    }
    const draft = pluginDraftSchema.parse({
      ...parsed,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      revision: current.revision + 1,
    });
    await writeJsonAtomic(this.pathFor(draft.id), draft);
    return draft;
  }

  async deleteDraft(id: string): Promise<void> {
    const draft = await this.getDraft(id);
    await rm(this.pathFor(id), { force: true });
    await removeOwnedPluginPackage(this.publishedDirectory, draft);
    this.catalog.refresh();
  }

  async validateDraft(id: string) {
    const current = await this.getDraft(id);
    const parsed = pluginDraftContentSchema.safeParse(contentOf(current));
    const errors = parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
    if (parsed.success) {
      const seenPermissions = new Set<string>();
      for (const [index, permission] of parsed.data.wizard.permissions.entries()) {
        const permissionResult = extensionPermissionRequestSchema.safeParse({ permission });
        if (!permissionResult.success) {
          errors.push({ path: ["wizard", "permissions", index], message: `Permission „${permission}“ ist nicht bekannt.` });
          continue;
        }
        if (seenPermissions.has(permission)) {
          errors.push({ path: ["wizard", "permissions", index], message: `Permission „${permission}“ darf nur einmal vorkommen.` });
        }
        seenPermissions.add(permission);
      }
      for (const [index, capability] of parsed.data.capabilities.entries()) {
        if (capability.permission === null) continue;
        if (!extensionPermissionRequestSchema.safeParse({ permission: capability.permission }).success) {
          errors.push({ path: ["capabilities", index, "permission"], message: `Permission „${capability.permission}“ ist nicht bekannt.` });
        }
      }
    }
    const remainsActive = current.activationStatus === "active" && errors.length === 0;
    const draft = await this.persistDraft(id, {
      ...contentOf(current),
      activationStatus: errors.length === 0 ? (remainsActive ? "active" : "ready") : "error",
    }, true);
    if (current.activationStatus === "active") {
      if (errors.length === 0) await this.writePackage(draft);
      else await removeOwnedPluginPackage(this.publishedDirectory, current);
      this.catalog.refresh();
    }
    return { draft, valid: errors.length === 0, errors };
  }

  async activateDraft(id: string) {
    const validation = await this.validateDraft(id);
    if (!validation.valid) throw new AppError(400, "PLUGIN_VALIDATION_FAILED", "Das Plugin enthält noch Validierungsfehler.");
    const readyDraft = validation.draft;
    const draft = await this.persistDraft(id, {
      ...contentOf(readyDraft),
      activationStatus: "active",
    }, true);
    const extensionId = await this.writePackage(draft);
    this.catalog.refresh();
    return { draft, extensionId };
  }

  async deactivateDraft(id: string) {
    const current = await this.getDraft(id);
    const draft = await this.persistDraft(id, { ...contentOf(current), activationStatus: "disabled" }, true);
    await removeOwnedPluginPackage(this.publishedDirectory, current);
    this.catalog.refresh();
    return draft;
  }

  async publishDraft(id: string) {
    const validation = await this.validateDraft(id);
    if (!validation.valid) throw new AppError(400, "PLUGIN_VALIDATION_FAILED", "Das Plugin enthält noch Validierungsfehler.");
    const current = validation.draft;
    const draft = await this.persistDraft(id, { ...contentOf(current), status: "published" }, true);
    const extensionId = await this.writePackage(draft);
    this.catalog.refresh();
    return { draft, extensionId };
  }

  private async writePackage(draft: PluginDraft): Promise<string> {
    const extensionId = `wrapt.local.${draft.slug}`;
    const finalPackageDirectory = join(this.publishedDirectory, draft.slug);
    const routePath = draft.surfaces.includes("sidebar") ? `/plugins/tool/${draft.slug}` : draft.routePath;
    const pageId = `${extensionId}.page.main`;
    const routeId = `${extensionId}.route.main`;
    const commands: Array<Record<string, unknown>> = [];
    const commandFor = (id: string, title: string, description: string) => {
      const commandId = `${extensionId}.command.${id}`;
      if (!commands.some((command) => command.id === commandId)) {
        commands.push({ id: commandId, title, description, category: draft.category });
      }
      return commandId;
    };
    const topbarEntries = surfaceEntries(draft, "topbar");
    const bottomBarEntries = surfaceEntries(draft, "bottom-bar");
    const dashboardEntries = surfaceEntries(draft, "dashboard");
    const contextEntries = surfaceEntries(draft, "context-menu");
    const orbitEntries = surfaceEntries(draft, "orbit");
    const contributes: Record<string, unknown> = {
      pages: [{ id: pageId, title: draft.name, description: draft.description }],
      routes: [{
        id: routeId,
        pageId,
        path: routePath,
        shell: "standard",
        persistent: true,
        prefetch: "idle",
        projectContext: false,
        topbar: true,
        breadcrumbs: true,
        standaloneActions: false,
        mobileNavigation: draft.surfaces.includes("sidebar"),
      }],
    };
    if (draft.surfaces.includes("sidebar")) {
      contributes.navigation = [{
        id: `${extensionId}.navigation.main`,
        routeId,
        label: draft.name,
        description: draft.description,
        group: "tools",
        order: 500,
        visibleByDefault: true,
      }];
    }
    if (topbarEntries.length > 0) {
      contributes.topbar = topbarEntries.map((entry, index) => ({
        id: `${extensionId}.topbar.${entry.id}`,
        kind: "action",
        routeId,
        commandId: commandFor(`topbar-${entry.id}`, entry.title, entry.description),
        placement: "secondary",
        order: index * 10,
        priority: 50,
        presentation: "label",
        compact: "hide",
      }));
    }
    if (bottomBarEntries.length > 0) {
      contributes.statusBar = bottomBarEntries.map((entry, index) => ({
        id: `${extensionId}.status-bar.${entry.id}`,
        kind: "text",
        title: entry.title,
        provider: `${extensionId}.status-provider.${entry.id}`,
        alignment: "right",
        order: index * 10,
        priority: 50,
        compact: "value",
      }));
    }
    if (dashboardEntries.length > 0) {
      contributes.dashboard = dashboardEntries.map((entry, index) => ({
        id: `${extensionId}.dashboard.${entry.id}`,
        kind: "card",
        title: entry.title,
        description: entry.description,
        defaultSize: "medium",
        order: index * 10,
        projectContext: false,
        visibleByDefault: true,
        provider: `${extensionId}.dashboard-provider.${entry.id}`,
        refresh: { mode: "on-demand" },
      }));
    }
    if (orbitEntries.length > 0) {
      contributes.orbit = orbitEntries.map((entry, index) => ({
        id: `${extensionId}.orbit.${entry.id}`,
        title: entry.title,
        description: entry.description,
        stateVersion: index + 1,
        stateSchema: `./schemas/${draft.slug}-${entry.id}.json`,
        defaultSize: { width: 420, height: 280 },
        resizable: true,
        projectContext: false,
        inspector: true,
        connections: "bidirectional",
        visibleByDefault: true,
      }));
    }
    if (contextEntries.length > 0) {
      contributes.contextMenus = contextEntries.map((entry, index) => ({
        id: `${extensionId}.context-menu.${entry.id}`,
        surface: "host.context-menu.project",
        commandId: commandFor(`context-${entry.id}`, entry.title, entry.description),
        group: "run",
        order: index * 10,
      }));
    }
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
      await writeFile(join(packageDirectory, "index.js"), `export default ${JSON.stringify({
        extensionId,
        routePath,
        pageMode: draft.pageMode,
        surfaces: draft.surfaces,
        activationStatus: draft.activationStatus,
      }, null, 2)};\n`, { encoding: "utf8", mode: 0o600 });
    });
    return extensionId;
  }
  private pathFor(id: string): string {
    if (!draftIdSchema.test(id)) throw new AppError(400, "VALIDATION_ERROR", "Die Draft-ID ist ungültig.");
    return join(this.draftDirectory, `${id}.json`);
  }
}
