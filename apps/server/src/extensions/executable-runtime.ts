import type { ExtensionManagementRequest, ExtensionManifestV1, ExtensionRegistryDetail, Sha256Integrity } from "@wrapt/extension-contracts";

/** Asynchrones Vorbereiten findet vor der synchronen Registry-Transaktion statt. */
export interface ExecutableExtensionRuntime {
  handles(extensionId: string): boolean;
  canActivate(manifest: ExtensionManifestV1, integrity: Sha256Integrity | undefined): boolean;
  prepare(request: ExtensionManagementRequest, current: ExtensionRegistryDetail | null): Promise<void>;
  finalize(detail: ExtensionRegistryDetail, previous: ExtensionRegistryDetail | null): ExtensionRegistryDetail;
  complete(extensionId: string): void;
  rollback(extensionId: string): void;
  matches(detail: ExtensionRegistryDetail): boolean;
}
