import type { ExtensionManagementRequest, ExtensionRegistryDetail } from "@wrapt/extension-contracts";
import { requireExtension, type ExtensionOperationContext, type ExtensionApplyResult as ApplyResult } from "./manager-operation-context.js";
import { installExtension, updateExtension } from "./manager-package-operations.js";
import { transitionExtension, uninstallExtension, reloadExtension } from "./manager-transitions.js";
import { rollbackExtension } from "./manager-rollback.js";
import { reviewPermissions } from "./manager-permissions.js";

export function applyExtensionOperation(context: ExtensionOperationContext, 
  request: ExtensionManagementRequest,
  current: ExtensionRegistryDetail | null,
): ApplyResult {
  switch (request.operation) {
    case "install":
      return installExtension(context, request, current);
    case "enable":
      return { detail: transitionExtension(context, request.extensionId, requireExtension(current), "enabling", true) };
    case "disable":
      return { detail: transitionExtension(context, request.extensionId, requireExtension(current), "deactivating", false) };
    case "uninstall":
      return { detail: uninstallExtension(request.extensionId, requireExtension(current)) };
    case "update":
      return updateExtension(context, request, requireExtension(current));
    case "rollback":
      return { detail: rollbackExtension(request, requireExtension(current), context.releaseStore, (candidate) => context.runtime.canActivateDetail(candidate)) };
    case "reload":
      return { detail: reloadExtension(context, request.extensionId, requireExtension(current)) };
    case "review-permissions":
      return {
        detail: reviewPermissions(
          request,
          requireExtension(current),
          context.database,
          (manifest, integrity, grants) => context.runtime.stageCatalogRelease(manifest, integrity, grants),
          (candidate) => context.runtime.canActivateDetail(candidate),
        ),
      };
  }
}
