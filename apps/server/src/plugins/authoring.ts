import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  pluginDraftContentSchema,
  pluginDraftSchema,
  pluginExampleSchema,
  type PluginDraft,
} from "@wrapt/contracts";
import type { LocalExtensionCatalog } from "../extensions/catalog.js";
import { extensionPermissionRequestSchema } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import { contentOf } from "./draft-content.js";
import { removeOwnedPluginPackage } from "./draft-package-ownership.js";
import { nextAvailablePluginSlug, replaceGeneratedPluginSlug } from "./draft-slugs.js";
import { writeJsonAtomic, writePluginPackage } from "./authoring-package.js";

const draftIdSchema = /^[0-9a-f-]{36}$/i;

export interface PluginRegistryBridge {
  syncLocalPlugin(extensionId: string): Promise<void>;
  disableLocalPlugin(extensionId: string): Promise<void>;
  uninstallLocalPlugin(extensionId: string): Promise<void>;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

/** Lokale Drafts und die versionierten Beispielpakete des Beta-Stores. */
export class PluginAuthoringService {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly draftDirectory: string,
    private readonly examplesDirectory: string,
    private readonly publishedDirectory: string,
    private readonly catalog: LocalExtensionCatalog,
    private readonly registry?: PluginRegistryBridge,
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
          if (content.sourceExampleId !== entry.name) return null;
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
    return this.withLock("slug-index", async () => {
      const parsed = pluginDraftContentSchema.parse(content);
      const occupied = new Set((await this.listDrafts()).map((draft) => draft.slug));
      const uniqueContent = replaceGeneratedPluginSlug(parsed, nextAvailablePluginSlug(parsed.slug, occupied));
      const now = new Date().toISOString();
      const draft = pluginDraftSchema.parse({ ...uniqueContent, id: randomUUID(), createdAt: now, updatedAt: now });
      await this.initialize();
      await writeJsonAtomic(this.pathFor(draft.id), draft);
      return draft;
    });
  }

  async updateDraft(id: string, content: unknown, expectedRevision?: number): Promise<PluginDraft> {
    return this.persistDraft(id, content, false, expectedRevision);
  }

  private async persistDraft(id: string, content: unknown, allowLifecycle: boolean, expectedRevision?: number): Promise<PluginDraft> {
    return this.withLock(`draft:${id}`, () => this.withLock("slug-index", () => this.persistDraftUnlocked(id, content, allowLifecycle, expectedRevision)));
  }

  private async persistDraftUnlocked(id: string, content: unknown, allowLifecycle: boolean, expectedRevision?: number): Promise<PluginDraft> {
    const current = await this.getDraft(id);
    const input = pluginDraftContentSchema.parse(content);
    const requestedRevision = expectedRevision ?? input.revision;
    if (requestedRevision !== current.revision) {
      throw new AppError(
        409,
        "PLUGIN_REVISION_CONFLICT",
        "Der Draft wurde inzwischen geändert; bitte die aktuelle Fassung laden.",
        { currentRevision: current.revision },
      );
    }
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
    await this.withLock(`package:${id}`, async () => {
      const draft = await this.getDraft(id);
      let uninstalled = false;
      try {
        await removeOwnedPluginPackage(this.publishedDirectory, draft);
        await rm(this.pathFor(id), { force: true });
        if (this.registry) {
          await this.registry.uninstallLocalPlugin(`wrapt.local.${draft.slug}`);
          uninstalled = true;
        }
        this.catalog.refresh();
      } catch (error) {
        await writeJsonAtomic(this.pathFor(id), draft);
        if (draft.activationStatus === "active") {
          await writePluginPackage(this.publishedDirectory, draft);
          if (uninstalled && this.registry) await this.registry.syncLocalPlugin(`wrapt.local.${draft.slug}`);
        }
        this.catalog.refresh();
        throw error;
      }
    });
  }

  async validateDraft(id: string) {
    return this.withLock(`package:${id}`, () => this.validateDraftUnlocked(id));
  }

  private async validateDraftUnlocked(id: string) {
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
      try {
        if (errors.length === 0) await writePluginPackage(this.publishedDirectory, draft);
        else await removeOwnedPluginPackage(this.publishedDirectory, current);
        this.catalog.refresh();
        if (errors.length === 0 && current.activationStatus === "active" && this.registry) {
          await this.registry.syncLocalPlugin(`wrapt.local.${draft.slug}`);
        }
      } catch (error) {
        if (current.activationStatus === "active") await writePluginPackage(this.publishedDirectory, current);
        else await removeOwnedPluginPackage(this.publishedDirectory, draft);
        await writeJsonAtomic(this.pathFor(current.id), current);
        throw error;
      }
    }
    return { draft, valid: errors.length === 0, errors };
  }

  async activateDraft(id: string) {
    return this.withLock(`package:${id}`, async () => {
      const validation = await this.validateDraftUnlocked(id);
      if (!validation.valid) throw new AppError(400, "PLUGIN_VALIDATION_FAILED", "Das Plugin enthält noch Validierungsfehler.");
      const readyDraft = validation.draft;
      const previous = readyDraft;
      const draft = await this.persistDraft(id, { ...contentOf(readyDraft), activationStatus: "active" }, true);
      try {
        const extensionId = await writePluginPackage(this.publishedDirectory, draft);
        this.catalog.refresh();
        if (this.registry) await this.registry.syncLocalPlugin(extensionId);
        return { draft, extensionId };
      } catch (error) {
        if (previous.activationStatus === "active") await writePluginPackage(this.publishedDirectory, previous);
        else await removeOwnedPluginPackage(this.publishedDirectory, draft);
        await writeJsonAtomic(this.pathFor(previous.id), previous);
        throw error;
      }
    });
  }

  async deactivateDraft(id: string) {
    return this.withLock(`package:${id}`, async () => {
      const current = await this.getDraft(id);
      const draft = await this.persistDraft(id, { ...contentOf(current), activationStatus: "disabled" }, true);
      let disabled = false;
      try {
        await removeOwnedPluginPackage(this.publishedDirectory, current);
        this.catalog.refresh();
        if (this.registry) {
          await this.registry.disableLocalPlugin(`wrapt.local.${current.slug}`);
          disabled = true;
        }
        return draft;
      } catch (error) {
        await writeJsonAtomic(this.pathFor(current.id), current);
        await writePluginPackage(this.publishedDirectory, current);
        this.catalog.refresh();
        if (disabled && this.registry) await this.registry.syncLocalPlugin(`wrapt.local.${current.slug}`);
        throw error;
      }
    });
  }

  async publishDraft(id: string) {
    return this.withLock(`package:${id}`, async () => {
      const validation = await this.validateDraftUnlocked(id);
      if (!validation.valid) throw new AppError(400, "PLUGIN_VALIDATION_FAILED", "Das Plugin enthält noch Validierungsfehler.");
      const current = validation.draft;
      const draft = await this.persistDraft(id, { ...contentOf(current), status: "published" }, true);
      try {
        const extensionId = await writePluginPackage(this.publishedDirectory, draft);
        this.catalog.refresh();
        if (current.activationStatus === "active" && this.registry) await this.registry.syncLocalPlugin(extensionId);
        return { draft, extensionId };
      } catch (error) {
        if (current.activationStatus === "active") await writePluginPackage(this.publishedDirectory, current);
        await writeJsonAtomic(this.pathFor(current.id), current);
        throw error;
      }
    });
  }

  private pathFor(id: string): string {
    if (!draftIdSchema.test(id)) throw new AppError(400, "VALIDATION_ERROR", "Die Draft-ID ist ungültig.");
    return join(this.draftDirectory, `${id}.json`);
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const current = previous.then(() => gate);
    this.locks.set(key, current);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
}
