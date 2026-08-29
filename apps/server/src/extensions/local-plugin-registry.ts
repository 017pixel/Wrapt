import { randomUUID } from "node:crypto";
import {
  extensionManifestV1Schema,
  type ExtensionManagementAccepted,
  type ExtensionManagementRequest,
  type ExtensionId,
  type ExtensionManifestV1,
  type ExtensionSource,
  type Sha256Integrity,
} from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import type { LocalExtensionCatalog } from "./catalog.js";
import type { ExtensionDatabase } from "./database.js";

interface LocalPluginRegistryOptions {
  database: ExtensionDatabase;
  catalog: () => LocalExtensionCatalog | undefined;
  register: (manifest: ExtensionManifestV1, source: ExtensionSource) => void;
  dispatch: (request: ExtensionManagementRequest) => Promise<ExtensionManagementAccepted>;
  commitActivePackage: (extensionId: ExtensionId, manifest: ExtensionManifestV1, integrity: Sha256Integrity) => void;
}

export class LocalPluginRegistry {
  constructor(private readonly options: LocalPluginRegistryOptions) {}

  private verifyPackage(catalog: LocalExtensionCatalog, extensionId: ExtensionId) {
    catalog.refresh();
    const entry = catalog.get(extensionId);
    if (entry === undefined) throw new AppError(404, "not-found", "Das materialisierte Plugin-Paket fehlt.");
    const manifest = catalog.resolvePackage(extensionId, entry.manifest.version, entry.package.integrity, catalog.revision());
    return { entry, manifest };
  }

  async sync(extensionId: ExtensionId): Promise<void> {
    const catalog = this.options.catalog();
    if (catalog === undefined) throw new AppError(501, "staging-failed", "Der Local Catalog ist nicht verfügbar.");
    const verified = this.verifyPackage(catalog, extensionId);
    const entry = verified.entry;
    if (entry.manifest.permissions.length > 0) {
      throw new AppError(409, "permissions-denied", "Lokale Plugins mit Permissions benötigen zuerst einen zentralen Review.");
    }
    const current = this.options.database.getExtension(extensionId);
    if (current?.lifecycle === "permissions-pending") {
      throw new AppError(409, "permissions-denied", "Für dieses Plugin steht noch ein Permission Review aus.");
    }
    if (current === null || current.installedVersion === undefined) {
      const source = {
        kind: "developer" as const,
        registrationId: randomUUID(),
        packageIntegrity: entry.package.integrity,
      };
      this.options.register(entry.manifest, source);
      const accepted = await this.options.dispatch({
        operation: "install",
        extensionId,
        expectedRevision: this.options.database.revision(),
        source,
        enableAfterInstall: true,
      });
      if (accepted.extension.lifecycle !== "active") {
        throw new AppError(409, "activation-failed", "Das lokale Plugin konnte nicht aktiviert werden.");
      }
    } else if (current.lifecycle !== "active") {
      await this.options.dispatch({ operation: "enable", extensionId, expectedRevision: this.options.database.revision() });
    }
    const installed = this.options.database.getExtension(extensionId);
    if (installed?.lifecycle !== "active") return;
    let activePackage: ReturnType<LocalPluginRegistry["verifyPackage"]>;
    try {
      activePackage = this.verifyPackage(catalog, extensionId);
    } catch (error) {
      await this.options.dispatch({ operation: "disable", extensionId, expectedRevision: this.options.database.revision() });
      throw error;
    }
    const manifest = extensionManifestV1Schema.parse({ ...activePackage.manifest, trust: "developer" });
    this.options.commitActivePackage(extensionId, manifest, activePackage.entry.package.integrity);
  }

  async disable(extensionId: ExtensionId, dispatch: LocalPluginRegistryOptions["dispatch"]): Promise<void> {
    const current = this.options.database.getExtension(extensionId);
    if (current?.lifecycle === "active") await dispatch({ operation: "disable", extensionId, expectedRevision: this.options.database.revision() });
  }

  async uninstall(extensionId: ExtensionId, dispatch: LocalPluginRegistryOptions["dispatch"]): Promise<void> {
    const current = this.options.database.getExtension(extensionId);
    if (current?.installedVersion !== undefined) await dispatch({ operation: "uninstall", extensionId, expectedRevision: this.options.database.revision(), data: "delete" });
  }
}
