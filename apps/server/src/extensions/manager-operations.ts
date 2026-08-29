import type {
  ExtensionManagementOperation,
  ExtensionRegistryDetail,
  ExtensionSource,
} from "@wrapt/extension-contracts";

type OperationType = ExtensionManagementOperation["type"];

function operations(...values: OperationType[]): OperationType[] {
  return values;
}

export function runtimeCanActivate(source: ExtensionSource): boolean {
  // Catalog- und lokale Paket-Entrypoints bleiben bis zur echten Runtime
  // fail-closed installiert, aber deaktiviert.
  return source.kind !== "catalog" && source.kind !== "local-package";
}

export function allowedOperationsFor(
  detail: ExtensionRegistryDetail,
  canActivate = runtimeCanActivate(detail.source),
): ExtensionManagementOperation["type"][] {
  const canUpdate = detail.availableVersion !== undefined || detail.lifecycle === "update-available";
  const canRollback = detail.rollbackVersion !== undefined;
  switch (detail.lifecycle) {
    case "available": return operations("install");
    case "installed": return operations(...(canActivate ? ["enable" as const] : []), ...(canUpdate ? ["update" as const] : []), ...(canRollback ? ["rollback" as const] : []), "uninstall");
    case "disabled": return operations(...(canActivate ? ["enable" as const] : []), ...(canUpdate ? ["update" as const] : []), ...(canRollback ? ["rollback" as const] : []), "uninstall");
    case "active": return operations("disable", ...(canUpdate ? ["update" as const] : []), ...(canRollback ? ["rollback" as const] : []), "reload", "uninstall");
    case "permissions-pending": return operations("review-permissions", "disable", "uninstall");
    case "update-available": return operations("update", ...(canActivate ? ["disable" as const] : []), "uninstall");
    case "crashed": return operations(...(canActivate ? ["reload" as const, "enable" as const, "disable" as const] : []), "uninstall");
    default: return operations();
  }
}
