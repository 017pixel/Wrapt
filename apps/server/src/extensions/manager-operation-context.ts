import type { ExtensionManifestV1, ExtensionPermissionReview, ExtensionRegistryDetail, ExtensionSource } from "@wrapt/extension-contracts";
import type { LocalExtensionCatalog } from "./catalog.js";
import type { ExtensionDatabase } from "./database.js";
import type { ExtensionReleaseStore } from "./release-store.js";
import type { ExtensionRuntimeCoordinator } from "./manager-runtime.js";
import { AppError } from "../utils/errors.js";

export interface ExtensionOperationContext {
  database: ExtensionDatabase;
  catalog: LocalExtensionCatalog | undefined;
  discovered: Map<string, { manifest: ExtensionManifestV1; source: ExtensionSource }>;
  runtime: ExtensionRuntimeCoordinator;
  releaseStore: ExtensionReleaseStore | undefined;
}

export interface ExtensionApplyResult {
  detail: ExtensionRegistryDetail | null;
  review?: ExtensionPermissionReview;
}

export function requireExtension(detail: ExtensionRegistryDetail | null): ExtensionRegistryDetail {
  if (detail === null) {
    throw new AppError(404, "not-found", "Die Extension ist nicht registriert.");
  }
  return detail;
}
