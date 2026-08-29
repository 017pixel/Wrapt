import {
  type ExtensionManagementRequest,
  type ExtensionManifestV1,
  type ExtensionPermissionRequests,
  type ExtensionRegistryDetail,
  type Sha256Integrity,
} from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import { defaultHealth, type ExtensionDatabase } from "./database.js";

type PermissionLike = { permission: string; scope?: unknown };

export function grantIsWithinRequest(request: PermissionLike, grant: PermissionLike): boolean {
  const requestedScope = request.scope as Record<string, unknown> | undefined;
  if (requestedScope === undefined) return true;
  const grantedScope = grant.scope as Record<string, unknown> | undefined;
  if (grantedScope === undefined) return false;
  for (const [key, grantedValues] of Object.entries(grantedScope)) {
    const requestedValues = requestedScope[key];
    if (!Array.isArray(requestedValues) || !Array.isArray(grantedValues)) return false;
    const allowed = new Set<unknown>(requestedValues);
    if (grantedValues.some((value) => !allowed.has(value))) return false;
  }
  return true;
}

type ReviewRequest = Extract<ExtensionManagementRequest, { operation: "review-permissions" }>;

export function reviewPermissions(
  request: ReviewRequest,
  detail: ExtensionRegistryDetail,
  database: ExtensionDatabase,
  stageCatalogRelease: (
    manifest: ExtensionManifestV1,
    packageIntegrity: Sha256Integrity,
    grants: ExtensionPermissionRequests,
  ) => void,
  canActivate: (detail: ExtensionRegistryDetail) => boolean = (candidate) => candidate.source.kind !== "catalog" && candidate.source.kind !== "local-package",
): ExtensionRegistryDetail {
  if (detail.lifecycle !== "permissions-pending") {
    throw new AppError(409, "operation-conflict", "Für diese Extension steht kein Review aus.");
  }
  const review = database.getReview(request.extensionId, request.reviewId);
  if (review === null) {
    throw new AppError(404, "not-found", "Das Permission Review ist nicht mehr offen.");
  }
  if (request.resolution.decision === "deny") {
    database.resolveReview(request.reviewId);
    return {
      ...detail,
      lifecycle: "installed",
      desiredEnablement: "disabled",
      runtimeActive: false,
      grantedPermissions: [],
    };
  }

  const grants = request.resolution.grants as ExtensionPermissionRequests;
  const requestedIds = new Map(review.requestedPermissions.map((entry) => [entry.permission, entry]));
  for (const grant of grants) {
    const requestEntry = requestedIds.get(grant.permission);
    if (requestEntry === undefined) {
      throw new AppError(409, "permissions-denied", `Die Permission ${grant.permission} wurde nicht angefragt.`);
    }
    if (!grantIsWithinRequest(requestEntry, grant)) {
      throw new AppError(409, "permissions-denied", `Der Grant für ${grant.permission} erweitert den angefragten Scope.`);
    }
  }
  if (detail.source.kind === "catalog") {
    stageCatalogRelease(detail.manifest, detail.source.packageIntegrity, grants);
  }
  database.resolveReview(request.reviewId);
  const activates = detail.desiredEnablement === "enabled" && canActivate({ ...detail, grantedPermissions: grants });
  return {
    ...detail,
    lifecycle: activates ? "active" : "installed",
    desiredEnablement: activates ? "enabled" : "disabled",
    runtimeActive: activates,
    grantedPermissions: grants,
    health: defaultHealth,
    ...(activates && detail.installedVersion !== undefined
      ? { activeVersion: detail.installedVersion }
      : {}),
  };
}
