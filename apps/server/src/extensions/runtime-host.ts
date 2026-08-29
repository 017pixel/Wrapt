import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
  extensionEntrypointPathSchema,
  extensionIdSchema,
  extensionPermissionRequestsSchema,
  semanticVersionSchema,
  sha256IntegritySchema,
  type ExtensionManifestV1,
  type ExtensionPermissionRequests,
  type Sha256Integrity,
} from "@wrapt/extension-contracts";
import {
  pluginDraftContentSchema,
  pluginDraftSchema,
  type PluginDraftContent,
} from "@wrapt/contracts";
import { z } from "zod";
import { AppError } from "../utils/errors.js";
import { ExtensionCapabilityBroker } from "./capability-broker.js";
import type { ExtensionRegistryDetail } from "@wrapt/extension-contracts";
import type { ExtensionReleaseSlot, ExtensionReleaseStore } from "./release-store.js";

const runtimePointerSchema = z.strictObject({
  extensionId: extensionIdSchema,
  version: semanticVersionSchema,
  packageIntegrity: sha256IntegritySchema,
  entrypoint: extensionEntrypointPathSchema,
  runtimeId: z.uuid(),
  activatedAt: z.iso.datetime(),
  health: z.strictObject({ status: z.literal("healthy"), checkedAt: z.iso.datetime() }),
});

export type ExtensionRuntimePointer = z.infer<typeof runtimePointerSchema>;

export interface ActiveExtensionRuntime {
  pointer: ExtensionRuntimePointer;
  content: PluginDraftContent;
}

export interface ExtensionRuntimeHostOptions {
  onStep?: (step: "pointer-written") => void;
}

function sameRelease(pointer: ExtensionRuntimePointer, detail: ExtensionRegistryDetail): boolean {
  return pointer.extensionId === detail.id
    && pointer.version === detail.activeVersion
    && pointer.packageIntegrity === detail.activeAssetRevision;
}

/**
 * Verifiziert und aktiviert ausschließlich deklarative UI-Pakete. Der
 * Entrypoint wird als Paketfakt geprüft; fremder Server-Code wird hier nicht
 * gestartet. Die eigentliche Oberfläche rendert der Wrapt-Host aus plugin.json.
 */
export class ExtensionRuntimeHost {
  constructor(
    private readonly pointerRoot: string,
    private readonly releaseStore: ExtensionReleaseStore,
    private readonly options: ExtensionRuntimeHostOptions = {},
  ) {
    mkdirSync(pointerRoot, { recursive: true, mode: 0o700 });
    this.assertDirectory(pointerRoot);
  }

  canActivate(manifest: ExtensionManifestV1, packageIntegrity: Sha256Integrity | undefined): boolean {
    if (!this.isDeclarativeUiManifest(manifest) || packageIntegrity === undefined) return false;
    const slot = this.releaseStore.readSlot(manifest.id, manifest.version, packageIntegrity);
    if (slot === null || !this.slotMatchesManifest(slot, manifest)) return false;
    try {
      this.readEntrypoint(slot, manifest.entrypoints.ui!);
      this.readContent(slot);
      return true;
    } catch {
      return false;
    }
  }

  activate(detail: ExtensionRegistryDetail): ActiveExtensionRuntime {
    const version = detail.activeVersion;
    const integrity = detail.activeAssetRevision;
    if (version === undefined || integrity === undefined || !this.isDeclarativeUiManifest(detail.manifest)) {
      throw new AppError(409, "activation-failed", "Für diese Extension existiert kein aktivierbares UI-Release.");
    }
    const slot = this.releaseStore.readSlot(detail.id, version, integrity);
    if (slot === null || !this.slotMatchesManifest(slot, detail.manifest)) {
      throw new AppError(409, "integrity-mismatch", "Der aktive Release-Slot passt nicht zur Registry.");
    }
    const entrypoint = detail.manifest.entrypoints.ui!;
    const previous = this.readPointer(detail.id);
    const checkedAt = new Date().toISOString();
    const pointer = runtimePointerSchema.parse({
      extensionId: detail.id,
      version,
      packageIntegrity: integrity,
      entrypoint,
      runtimeId: randomUUID(),
      activatedAt: checkedAt,
      health: { status: "healthy", checkedAt },
    });
    try {
      this.readEntrypoint(slot, entrypoint);
      const content = this.readContent(slot);
      this.writePointer(pointer);
      this.options.onStep?.("pointer-written");
      this.healthHandshake(pointer, slot, detail.manifest, content);
      return { pointer, content };
    } catch (error) {
      this.restorePointer(detail.id, previous);
      if (error instanceof AppError) throw error;
      throw new AppError(409, "health-check-failed", "Der UI-Entrypoint hat den Health-Handshake nicht bestanden.");
    }
  }

  deactivate(extensionId: string): void {
    const directory = join(this.pointerRoot, extensionIdSchema.parse(extensionId));
    if (existsSync(directory)) this.assertDirectory(directory);
    rmSync(join(directory, "current.json"), { force: true });
  }

  readPointer(extensionId: string): ExtensionRuntimePointer | null {
    try {
      const path = this.pointerPath(extensionIdSchema.parse(extensionId));
      if (!existsSync(path)) return null;
      this.assertDirectory(resolve(path, ".."));
      return runtimePointerSchema.parse(JSON.parse(readFileSync(path, "utf8")) as unknown);
    } catch {
      return null;
    }
  }

  restorePointer(extensionId: string, pointer: ExtensionRuntimePointer | null): void {
    if (pointer === null) {
      this.deactivate(extensionId);
      return;
    }
    this.writePointer(pointer);
  }

  matches(detail: ExtensionRegistryDetail): boolean {
    const pointer = this.readPointer(detail.id);
    if (pointer === null || !sameRelease(pointer, detail)) return false;
    try {
      const slot = this.releaseStore.readSlot(detail.id, pointer.version, pointer.packageIntegrity);
      if (slot === null) return false;
      const content = this.readContent(slot);
      this.healthHandshake(pointer, slot, detail.manifest, content);
      return true;
    } catch {
      return false;
    }
  }

  activeContent(extensionId: string): ActiveExtensionRuntime | null {
    const pointer = this.readPointer(extensionId);
    if (pointer === null) return null;
    const slot = this.releaseStore.readSlot(pointer.extensionId, pointer.version, pointer.packageIntegrity);
    if (slot === null) return null;
    try {
      const content = this.readContent(slot);
      this.healthHandshake(pointer, slot, slot.manifest, content);
      return { pointer, content };
    } catch {
      return null;
    }
  }

  listActiveContent(): ActiveExtensionRuntime[] {
    if (!existsSync(this.pointerRoot)) return [];
    return readdirSync(this.pointerRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.activeContent(entry.name))
      .filter((runtime): runtime is ActiveExtensionRuntime => runtime !== null);
  }

  broker(extensionId: string, grants: ExtensionPermissionRequests): ExtensionCapabilityBroker {
    const pointer = this.readPointer(extensionId);
    if (pointer === null) throw new AppError(409, "activation-failed", "Die Extension besitzt keinen aktiven Runtime-Pointer.");
    return new ExtensionCapabilityBroker(extensionId, extensionPermissionRequestsSchema.parse(grants));
  }

  private isDeclarativeUiManifest(manifest: ExtensionManifestV1): boolean {
    return manifest.entrypoints.ui !== undefined && manifest.entrypoints.server === undefined;
  }

  private slotMatchesManifest(slot: ExtensionReleaseSlot, manifest: ExtensionManifestV1): boolean {
    return slot.extensionId === manifest.id
      && slot.version === manifest.version
      && JSON.stringify(slot.manifest) === JSON.stringify(manifest);
  }

  private readEntrypoint(slot: ExtensionReleaseSlot, entrypoint: string): string {
    const parsed = extensionEntrypointPathSchema.parse(entrypoint);
    const root = realpathSync(slot.packageDirectory);
    const path = resolve(root, parsed.slice(2));
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      throw new AppError(409, "integrity-mismatch", "Der Entrypoint verlässt den Release-Slot.");
    }
    const stats = lstatSync(path);
    if (stats.isSymbolicLink() || !stats.isFile() || realpathSync(path) !== path) {
      throw new AppError(409, "integrity-mismatch", "Der UI-Entrypoint ist keine reguläre Slot-Datei.");
    }
    return path;
  }

  private readContent(slot: ExtensionReleaseSlot): PluginDraftContent {
    const path = join(slot.packageDirectory, "plugin.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const fullDraft = pluginDraftSchema.safeParse(raw);
    const content = fullDraft.success
      ? (() => {
        const draftContent = { ...fullDraft.data } as Record<string, unknown>;
        delete draftContent.id;
        delete draftContent.createdAt;
        delete draftContent.updatedAt;
        return pluginDraftContentSchema.parse(draftContent);
      })()
      : pluginDraftContentSchema.parse(raw);
    if (content.version !== slot.version) {
      throw new AppError(409, "integrity-mismatch", "plugin.json und Manifest besitzen unterschiedliche Versionen.");
    }
    return content;
  }

  private healthHandshake(
    pointer: ExtensionRuntimePointer,
    slot: ExtensionReleaseSlot,
    manifest: ExtensionManifestV1,
    content: PluginDraftContent,
  ): void {
    if (pointer.extensionId !== manifest.id
      || pointer.version !== slot.version
      || pointer.packageIntegrity !== slot.packageIntegrity
      || pointer.entrypoint !== manifest.entrypoints.ui) {
      throw new AppError(409, "health-check-failed", "Der Runtime-Pointer besteht den Release-Handshake nicht.");
    }
    this.readEntrypoint(slot, manifest.entrypoints.ui!);
    if (content.version !== pointer.version) throw new AppError(409, "health-check-failed", "Die Runtime meldet eine abweichende Version.");
  }

  private pointerPath(extensionId: string): string {
    return join(this.pointerRoot, extensionId, "current.json");
  }

  private writePointer(pointer: ExtensionRuntimePointer): void {
    const directory = join(this.pointerRoot, pointer.extensionId);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.assertDirectory(directory);
    const path = this.pointerPath(pointer.extensionId);
    const temporaryPath = join(directory, `.current-${randomUUID()}.json`);
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(pointer)}\n`, { mode: 0o600, flush: true });
      renameSync(temporaryPath, path);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }

  private assertDirectory(path: string): void {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`Runtime-Pfad ist kein reguläres Verzeichnis: ${relative(this.pointerRoot, path)}`);
  }
}
