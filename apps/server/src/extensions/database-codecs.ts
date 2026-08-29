import {
  extensionHealthSchema,
  extensionIdSchema,
  extensionManagementOperationSchema,
  extensionPermissionRequestsSchema,
  extensionRegistryDetailSchema,
  extensionSourceSchema,
  semanticVersionSchema,
  sha256IntegritySchema,
  type ExtensionHealth,
  type ExtensionManagementOperation,
  type ExtensionPermissionReview,
  type ExtensionRegistryDetail,
  type ExtensionSource,
} from "@wrapt/extension-contracts";
import { canonicalCatalogProviderId } from "./catalog.js";

export interface ExtensionRow {
  id: string;
  name: string;
  description: string;
  publisher: string;
  source_json: string;
  effective_trust: string;
  lifecycle: string;
  desired_enablement: string;
  runtime_active: number;
  required: number;
  installed_version: string | null;
  active_version: string | null;
  available_version: string | null;
  rollback_version: string | null;
  rollback_asset_revision: string | null;
  active_asset_revision: string | null;
  manifest_json: string | null;
  granted_permissions_json: string;
  health_json: string;
  created_at: string;
  updated_at: string;
}

export interface OperationRow {
  id: string;
  extension_id: string;
  type: string;
  status: string;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  target_version: string | null;
  error_json: string | null;
}

export interface ReviewRow {
  review_id: string;
  extension_id: string;
  reason: string;
  requested_json: string;
  added_json: string;
  created_at: string;
}

export interface RegistryStateRow { revision: number }

export const defaultHealth: ExtensionHealth = Object.freeze({ status: "unknown", consecutiveFailures: 0 });

function sourceFromJson(value: string): ExtensionSource {
  const source = extensionSourceSchema.parse(JSON.parse(value));
  return source.kind === "catalog" ? { ...source, providerId: canonicalCatalogProviderId(source.providerId) } : source;
}

function optionalVersion(value: string | null) {
  return value === null ? undefined : semanticVersionSchema.parse(value);
}

export function detailFromRow(row: ExtensionRow, permissionReview?: ExtensionPermissionReview): ExtensionRegistryDetail | null {
  try {
    return extensionRegistryDetailSchema.parse({
      id: extensionIdSchema.parse(row.id),
      name: row.name,
      description: row.description,
      publisher: row.publisher,
      source: sourceFromJson(row.source_json),
      effectiveTrust: row.effective_trust,
      lifecycle: row.lifecycle,
      desiredEnablement: row.desired_enablement,
      runtimeActive: row.runtime_active === 1,
      required: row.required === 1,
      installedVersion: optionalVersion(row.installed_version),
      activeVersion: optionalVersion(row.active_version),
      availableVersion: optionalVersion(row.available_version),
      rollbackVersion: optionalVersion(row.rollback_version),
      rollbackAssetRevision: row.rollback_asset_revision === null ? undefined : sha256IntegritySchema.parse(row.rollback_asset_revision),
      activeAssetRevision: row.active_asset_revision === null ? undefined : sha256IntegritySchema.parse(row.active_asset_revision),
      allowedOperations: [],
      ...(permissionReview !== undefined ? { permissionReview } : {}),
      manifest: JSON.parse(row.manifest_json ?? "null"),
      grantedPermissions: extensionPermissionRequestsSchema.parse(JSON.parse(row.granted_permissions_json)),
      health: extensionHealthSchema.parse(JSON.parse(row.health_json)),
    });
  } catch {
    return null;
  }
}

export function reviewFromRow(row: ReviewRow): ExtensionPermissionReviewRow | null {
  try {
    return {
      reviewId: row.review_id,
      reason: row.reason === "update" ? "update" : "install",
      requestedPermissions: extensionPermissionRequestsSchema.parse(JSON.parse(row.requested_json)),
      addedPermissions: extensionPermissionRequestsSchema.parse(JSON.parse(row.added_json)),
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}

export interface ExtensionPermissionReviewRow {
  reviewId: string;
  reason: "install" | "update";
  requestedPermissions: ExtensionRegistryDetail["grantedPermissions"];
  addedPermissions: ExtensionRegistryDetail["grantedPermissions"];
  createdAt: string;
}

export function operationFromRow(row: OperationRow): ExtensionManagementOperation | null {
  try {
    return extensionManagementOperationSchema.parse({
      id: row.id,
      type: row.type,
      status: row.status,
      requestedAt: row.requested_at,
      ...(row.started_at !== null ? { startedAt: row.started_at } : {}),
      ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
      ...(row.target_version !== null ? { targetVersion: semanticVersionSchema.parse(row.target_version) } : {}),
      ...(row.error_json !== null ? { error: JSON.parse(row.error_json) } : {}),
    });
  } catch {
    return null;
  }
}
