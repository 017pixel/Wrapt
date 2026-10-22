import { randomUUID } from "node:crypto";
import type { ExtensionManagementRequest, ExtensionRegistryDetail, ExtensionLifecycleState } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import { canonicalCatalogProviderId } from "./catalog.js";
import { defaultHealth } from "./database.js";
import { grantIsWithinRequest } from "./manager-permissions.js";
import { assertExtensionTransition } from "./manager-transitions.js";
import type { ExtensionOperationContext, ExtensionApplyResult as ApplyResult } from "./manager-operation-context.js";

export function installExtension(context: ExtensionOperationContext, 
  request: Extract<ExtensionManagementRequest, { operation: "install" }>,
  current: ExtensionRegistryDetail | null,
): ApplyResult {
  if (current !== null && current.installedVersion !== undefined) {
    throw new AppError(409, "operation-conflict", "Die Extension ist bereits installiert.");
  }

  let discovered = context.discovered.get(request.extensionId);

  if (request.source.kind === "catalog") {
    if (context.catalog === undefined) {
      throw new AppError(501, "staging-failed", "Der Local Catalog ist nicht verfügbar.");
    }
    const entry = context.catalog.get(request.extensionId);
    if (entry === undefined || canonicalCatalogProviderId(entry.providerId) !== canonicalCatalogProviderId(request.source.providerId)) {
      throw new AppError(
        404,
        "not-found",
        "Der Catalog-Eintrag existiert nicht unter diesem Provider.",
      );
    }
    const manifest = context.catalog.resolvePackage(
      request.extensionId,
      request.source.version,
      request.source.packageIntegrity,
      request.source.catalogRevision,
    );
    // Die Registry-Quelle enthält nie Install-Artefakte wie die
    // Catalog-Revision; sie muss der `extensionSourceSchema` genügen.
    discovered = {
      manifest,
      source: {
        kind: "catalog",
        providerId: canonicalCatalogProviderId(request.source.providerId),
        packageIntegrity: request.source.packageIntegrity,
      },
    };
    context.runtime.stageCatalogRelease(manifest, request.source.packageIntegrity, []);
  } else if (request.source.kind === "local-package") {
    throw new AppError(
      501,
      "staging-failed",
      "Paketinstallationen aus .rwext folgen mit dem Paket-Installer.",
    );
  }

  if (discovered === undefined) {
    throw new AppError(404, "not-found", "Die Extension wurde nicht entdeckt.");
  }
  if (request.source.kind !== discovered.source.kind) {
    throw new AppError(409, "operation-conflict", "Die Installationsquelle passt nicht zur Discovery.");
  }
  const manifest = discovered.manifest;
  // Developer-Quellen materialisieren denselben lokalen Catalog-Snapshot,
  // erhalten aber im aktiven Registry-Fakt den effektiven Developer-Trust.
  const effectiveTrust = discovered.source.kind === "catalog" ? ("catalog-first-party" as const) : ("developer" as const);
  const registryManifest = { ...manifest, trust: effectiveTrust };
  if (discovered.source.packageIntegrity !== undefined && (manifest.entrypoints.ui !== undefined || manifest.entrypoints.server !== undefined)) {
    context.runtime.stageCatalogRelease(registryManifest, discovered.source.packageIntegrity, []);
  }
  const needsReview = manifest.permissions.length > 0;
  const canActivate = context.runtime.canActivateSource(discovered.source, registryManifest);
  const desiredEnablement = request.enableAfterInstall && canActivate ? "enabled" : "disabled";
  const activeAssetRevision = canActivate && discovered.source.packageIntegrity !== undefined
    ? discovered.source.packageIntegrity
    : undefined;
  const activates = desiredEnablement === "enabled"
    && canActivate
    && (manifest.entrypoints.ui === undefined || activeAssetRevision !== undefined);
  // Der effektive Trust folgt der Quelle, nicht der Selbstauskunft des
  // Manifests: Ein Catalog-Paket ist immer `catalog-first-party`, eine
  // Developer-Installation immer `developer`.
  const detail: ExtensionRegistryDetail = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    publisher: manifest.publisher,
    source: discovered.source,
    effectiveTrust,
    lifecycle: needsReview ? "permissions-pending" : "installed",
    desiredEnablement,
    runtimeActive: false,
    // V1: system- und builtin-Quellen werden nicht über den Install-
    // Request installiert; developer-Installationen sind nie required.
    required: false,
    installedVersion: manifest.version,
    ...(!needsReview && activates
      ? {
        activeVersion: manifest.version,
        ...(activeAssetRevision !== undefined ? { activeAssetRevision } : {}),
      }
      : {}),
    allowedOperations: [],
    manifest: registryManifest,
    grantedPermissions: [],
    health: defaultHealth,
  };

  if (needsReview) {
    return {
      detail,
      review: {
        reviewId: randomUUID(),
        reason: "install",
        requestedPermissions: manifest.permissions,
        addedPermissions: manifest.permissions,
        createdAt: new Date().toISOString(),
      },
    };
  }

  return {
    detail: activates
      ? { ...detail, lifecycle: "active", runtimeActive: true }
      : detail,
  };
}

export function updateExtension(context: ExtensionOperationContext, 
  request: Extract<ExtensionManagementRequest, { operation: "update" }>,
  detail: ExtensionRegistryDetail,
): ApplyResult {
  if (detail.lifecycle !== "update-available" && detail.availableVersion === undefined) {
    throw new AppError(
      409,
      "operation-conflict",
      "Für diese Extension steht kein Update bereit.",
    );
  }
  if (context.catalog === undefined) {
    throw new AppError(501, "staging-failed", "Der Local Catalog ist nicht verfügbar.");
  }
  const entry = context.catalog.get(request.extensionId);
  if (entry === undefined || canonicalCatalogProviderId(entry.providerId) !== canonicalCatalogProviderId(request.target.providerId)) {
    throw new AppError(
      404,
      "not-found",
      "Der Catalog-Eintrag existiert nicht unter diesem Provider.",
    );
  }
  const manifest = context.catalog.resolvePackage(
    request.extensionId,
    request.target.version,
    request.target.packageIntegrity,
    request.target.catalogRevision,
  );
  // Grants behalten, die die neue Manifestfassung weiterhin abdeckt;
  // alles andere gehört nicht mehr in die Detail-Grants.
  const requestedById = new Map(
    manifest.permissions.map((entry) => [entry.permission, entry]),
  );
  const grantedPermissions = detail.grantedPermissions.filter((grant) => {
    const requested = requestedById.get(grant.permission);
    return requested !== undefined && grantIsWithinRequest(requested, grant);
  });

  // Neue oder erweiterte Permission-Requests führen zu einem Review statt
  // einer stillen Aktivierung (reason `update`).
  const addedPermissions = manifest.permissions.filter((requested) => {
    const granted = grantedPermissions.find(
      (grant) => grant.permission === requested.permission,
    );
    return granted === undefined || !grantIsWithinRequest(requested, granted);
  });
  const needsReview = addedPermissions.length > 0;
  const targetSource = { ...detail.source, packageIntegrity: request.target.packageIntegrity };
  context.runtime.stageCatalogRelease(manifest, request.target.packageIntegrity, grantedPermissions);
  const canActivate = context.runtime.canActivateSource(targetSource, manifest);

  const steps: ExtensionLifecycleState[] = [];
  if (detail.lifecycle === "active") {
    steps.push("deactivating", "disabled", "update-available", "staging");
  } else {
    steps.push("staging");
  }
  steps.push(...(needsReview ? (["permissions-pending"] as const) : (["updating"] as const)));
  const activates = detail.desiredEnablement === "enabled" && canActivate;
  const targetLifecycle = needsReview
    ? "permissions-pending"
    : activates
      ? "active"
      : "installed";
  const targetSteps: ExtensionLifecycleState[] = needsReview
    ? []
    : activates
      ? ["activating", "active"]
      : ["installed"];
  const walk: ExtensionLifecycleState[] = [...steps, ...targetSteps];
  let previous = detail.lifecycle;
  for (const step of walk) {
    assertExtensionTransition(request.extensionId, previous, step);
    previous = step;
  }

  const rollbackVersion = detail.activeVersion ?? detail.installedVersion;
  const rollbackAssetRevision = detail.source.kind === "catalog"
    ? detail.source.packageIntegrity
    : detail.activeAssetRevision;
  const next: ExtensionRegistryDetail = {
    ...detail,
    source: targetSource,
    name: manifest.name,
    description: manifest.description,
    publisher: manifest.publisher,
    manifest,
    installedVersion: manifest.version,
    activeVersion:
      !needsReview && activates
        ? manifest.version
        : undefined,
    ...(!needsReview && activates ? { activeAssetRevision: request.target.packageIntegrity } : { activeAssetRevision: undefined }),
    rollbackVersion,
    rollbackAssetRevision,
    availableVersion: undefined,
    lifecycle: targetLifecycle,
    runtimeActive: !needsReview && activates,
    desiredEnablement: canActivate ? detail.desiredEnablement : "disabled",
    grantedPermissions,
    health: defaultHealth,
  };

  if (!needsReview) return { detail: next };
  return {
    detail: next,
    review: {
      reviewId: randomUUID(),
      reason: "update",
      requestedPermissions: manifest.permissions,
      addedPermissions,
      createdAt: new Date().toISOString(),
    },
  };
}
