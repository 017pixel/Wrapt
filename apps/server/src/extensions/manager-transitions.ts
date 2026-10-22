import { isExtensionLifecycleTransitionAllowed, type ExtensionLifecycleState, type ExtensionRegistryDetail } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import { defaultHealth } from "./database.js";
import type { ExtensionOperationContext } from "./manager-operation-context.js";

export function assertExtensionTransition(
  extensionId: string,
  from: ExtensionLifecycleState,
  to: ExtensionLifecycleState,
): void {
  if (!isExtensionLifecycleTransitionAllowed(from, to)) {
    throw new AppError(
      409,
      "operation-conflict",
      `Übergang ${from} → ${to} ist für ${extensionId} nicht erlaubt.`,
    );
  }
}

export function transitionExtension(context: ExtensionOperationContext, 
  extensionId: string,
  detail: ExtensionRegistryDetail,
  first: ExtensionLifecycleState,
  enable: boolean,
): ExtensionRegistryDetail {
  const canActivate = context.runtime.canActivateDetail(detail);
  if (enable && !canActivate) throw new AppError(409, "activation-failed", "Diese Paketquelle bleibt bis zur verifizierten Runtime deaktiviert.");
  const steps: ExtensionLifecycleState[] = [];
  if (enable) {
    if (isExtensionLifecycleTransitionAllowed(detail.lifecycle, "enabling")) {
      steps.push("enabling", "activating");
    } else if (
      isExtensionLifecycleTransitionAllowed(detail.lifecycle, "activating")
    ) {
      steps.push("activating");
    } else if (
      isExtensionLifecycleTransitionAllowed(detail.lifecycle, "active")
    ) {
      steps.push("active");
    } else {
      steps.push(first, "activating", "active");
    }
  } else if (isExtensionLifecycleTransitionAllowed(detail.lifecycle, "deactivating")) {
    steps.push("deactivating", "disabled");
  } else if (isExtensionLifecycleTransitionAllowed(detail.lifecycle, "disabled")) {
    steps.push("disabled");
  } else {
    steps.push(first, "disabled");
  }
  let previous = detail.lifecycle;
  // Ein offenes Permission Review endet mit der Deaktivierung: Der Nutzer
  // will die Extension nicht mehr — der Review wäre sonst dauerhaft
  // verwaist und könnte nie mehr aufgelöst werden.
  if (!enable && detail.lifecycle === "permissions-pending") {
    const open = context.database.openReview(extensionId);
    if (open !== null) context.database.resolveReview(open.reviewId);
  }
  for (const step of steps) {
    assertExtensionTransition(extensionId, previous, step);
    previous = step;
  }
  const activates = enable && canActivate;
  const target: ExtensionLifecycleState = enable
    ? (activates ? "active" : "installed")
    : "disabled";
  return {
    ...detail,
    lifecycle: target,
    desiredEnablement: enable ? "enabled" : "disabled",
    runtimeActive: activates,
    health: defaultHealth,
    ...(activates ? { activeVersion: detail.installedVersion } : { activeVersion: undefined }),
  };
}

export function uninstallExtension(extensionId: string, detail: ExtensionRegistryDetail): ExtensionRegistryDetail {
  const steps: ExtensionLifecycleState[] =
    detail.lifecycle === "active"
      ? ["deactivating", "disabled", "uninstalling"]
      : ["uninstalling"];
  let previous = detail.lifecycle;
  for (const step of steps) {
    assertExtensionTransition(extensionId, previous, step);
    previous = step;
  }
  // Die Extension bleibt als „available" in der Registry: Das
  // Operationsjournal, Health und ein möglicher Permission Review bleiben
  // lesbar, Installationsversionen werden zurückgesetzt.
  return {
    ...detail,
    lifecycle: "available",
    desiredEnablement: "disabled",
    runtimeActive: false,
    installedVersion: undefined,
    activeVersion: undefined,
    rollbackAssetRevision: undefined,
    availableVersion: undefined,
    rollbackVersion: undefined,
    activeAssetRevision: undefined,
    grantedPermissions: [],
    health: defaultHealth,
  };
}

export function reloadExtension(context: ExtensionOperationContext, extensionId: string, detail: ExtensionRegistryDetail): ExtensionRegistryDetail {
  const canActivate = context.runtime.canActivateDetail(detail);
  if (!canActivate) throw new AppError(409, "activation-failed", "Diese Paketquelle bleibt bis zur verifizierten Runtime deaktiviert.");
  // `deactivating` → `activating` existiert in der Matrix nicht: Ein Reload
  // läuft deshalb über den vollständigen Pfad durch `disabled`, ein
  // abgestürzter Prozess startet direkt neu, alle übrigen Zustände nutzen
  // den regulären Enable-Pfad.
  const steps: ExtensionLifecycleState[] = [];
  if (
    detail.lifecycle === "active" ||
    detail.lifecycle === "update-available"
  ) {
    steps.push("deactivating", "disabled", "enabling", "activating");
  } else if (detail.lifecycle === "crashed") {
    steps.push("activating");
  } else {
    steps.push("enabling", "activating");
  }
  let previous = detail.lifecycle;
  for (const step of steps) {
    assertExtensionTransition(extensionId, previous, step);
    previous = step;
  }
  const activates = canActivate;
  return {
    ...detail,
    lifecycle: activates ? "active" : "installed",
    runtimeActive: activates,
    health: defaultHealth,
  };
}
