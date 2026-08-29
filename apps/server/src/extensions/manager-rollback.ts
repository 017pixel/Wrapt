import type {
  ExtensionManagementRequest,
  ExtensionRegistryDetail,
} from "@wrapt/extension-contracts";
import { semanticVersionSchema } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import type { ExtensionReleaseStore } from "./release-store.js";

type RollbackRequest = Extract<ExtensionManagementRequest, { operation: "rollback" }>;

export function rollbackExtension(
  request: RollbackRequest,
  detail: ExtensionRegistryDetail,
  releaseStore: ExtensionReleaseStore | undefined,
  canActivate: (detail: ExtensionRegistryDetail) => boolean = (candidate) => candidate.source.kind !== "catalog" && candidate.source.kind !== "local-package",
): ExtensionRegistryDetail {
  if (detail.rollbackVersion === undefined || request.targetVersion !== detail.rollbackVersion) {
    throw new AppError(409, "rollback-unavailable", "Die Zielversion liegt nicht für Rollback vor.");
  }

  if (detail.source.kind === "catalog") {
    const slot = detail.rollbackAssetRevision === undefined
      ? releaseStore?.readVersion(detail.id, detail.rollbackVersion)
      : releaseStore?.readSlot(detail.id, detail.rollbackVersion, detail.rollbackAssetRevision);
    if (slot === null || slot === undefined) {
      throw new AppError(409, "rollback-unavailable", "Der verifizierte vorherige Release-Slot fehlt.");
    }
    const previousVersion = detail.installedVersion;
    const previousIntegrity = detail.source.packageIntegrity;
    const candidate: ExtensionRegistryDetail = {
      ...detail,
      name: slot.manifest.name,
      description: slot.manifest.description,
      publisher: slot.manifest.publisher,
      source: { ...detail.source, packageIntegrity: slot.packageIntegrity },
      manifest: { ...slot.manifest, trust: detail.effectiveTrust },
      installedVersion: semanticVersionSchema.parse(slot.version),
      activeVersion: request.enableAfterRollback ? semanticVersionSchema.parse(slot.version) : undefined,
      activeAssetRevision: request.enableAfterRollback ? slot.packageIntegrity : undefined,
      rollbackVersion: previousVersion,
      rollbackAssetRevision: previousIntegrity,
      availableVersion: undefined,
      grantedPermissions: slot.grantedPermissions,
      lifecycle: request.enableAfterRollback ? "active" : "disabled",
      runtimeActive: request.enableAfterRollback,
      health: { status: "stopped", consecutiveFailures: 0 },
    };
    if (request.enableAfterRollback && !canActivate(candidate)) {
      throw new AppError(409, "activation-failed", "Der vorherige Release-Slot besteht den Runtime-Handshake nicht.");
    }
    return candidate;
  }

  if (request.enableAfterRollback && !canActivate(detail)) {
    throw new AppError(409, "rollback-unavailable", "Diese Paketquelle besitzt keinen verifizierten Release-Slot.");
  }
  const activates = request.enableAfterRollback;
  return {
    ...detail,
    ...(activates
      ? {
        activeVersion: detail.rollbackVersion,
        activeAssetRevision: detail.rollbackAssetRevision,
        rollbackAssetRevision: detail.activeAssetRevision,
        lifecycle: "active" as const,
        runtimeActive: true,
      }
      : {
        activeVersion: undefined,
        activeAssetRevision: undefined,
        rollbackAssetRevision: detail.activeAssetRevision,
        lifecycle: "installed" as const,
        runtimeActive: false,
      }),
    health: { status: "unknown", consecutiveFailures: 0 },
  };
}
