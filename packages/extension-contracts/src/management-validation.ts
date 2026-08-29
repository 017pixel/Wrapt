import type { Sha256Integrity } from "./catalog.js";
import type { ExtensionSourceKind } from "./management.js";
import type { ExtensionLifecycleState } from "./lifecycle.js";
import type { ExtensionTrustLevel } from "./manifest.js";

export interface RegistrySummaryValidationInput {
  source: { kind: ExtensionSourceKind };
  effectiveTrust: ExtensionTrustLevel;
  lifecycle: ExtensionLifecycleState;
  required: boolean;
  runtimeActive: boolean;
  installedVersion?: string | undefined;
  activeVersion?: string | undefined;
  rollbackVersion?: string | undefined;
  rollbackAssetRevision?: Sha256Integrity | undefined;
  permissionReview?: unknown;
}

export function registrySummaryIssues(summary: RegistrySummaryValidationInput) {
  const issues: Array<{ message: string; path: PropertyKey[] }> = [];
  const expectedTrustBySource = {
    system: ["system"],
    builtin: ["builtin"],
    catalog: ["catalog-first-party"],
    developer: ["developer"],
    "local-package": ["developer", "sandboxed-webview"],
  } as const;

  if (!(expectedTrustBySource[summary.source.kind] as readonly string[]).includes(summary.effectiveTrust)) {
    issues.push({ message: "Source und effektiver Trust passen nicht zusammen.", path: ["effectiveTrust"] });
  }
  if (summary.required !== (summary.source.kind === "system")) {
    issues.push({ message: "Nur System Extensions sind in V1 verpflichtend.", path: ["required"] });
  }
  if (summary.activeVersion !== undefined && summary.installedVersion === undefined) {
    issues.push({ message: "Eine aktive Version benötigt eine installierte Version.", path: ["activeVersion"] });
  }
  if (summary.rollbackAssetRevision !== undefined && summary.rollbackVersion === undefined) {
    issues.push({ message: "Eine Rollback-Asset-Revision benötigt eine Rollback-Version.", path: ["rollbackAssetRevision"] });
  }
  if (summary.lifecycle === "available" && (summary.installedVersion !== undefined || summary.runtimeActive)) {
    issues.push({ message: "Eine verfügbare Extension darf noch nicht installiert oder aktiv sein.", path: ["lifecycle"] });
  }
  if (summary.lifecycle === "active" && (!summary.runtimeActive || summary.activeVersion === undefined)) {
    issues.push({ message: "Eine aktive Phase benötigt eine aktive Runtime und Version.", path: ["lifecycle"] });
  }
  if (summary.lifecycle === "disabled" && summary.runtimeActive) {
    issues.push({ message: "Eine deaktivierte Extension darf keine aktive Runtime melden.", path: ["runtimeActive"] });
  }
  if ((summary.lifecycle === "permissions-pending") !== (summary.permissionReview !== undefined)) {
    issues.push({ message: "Permission Review und Lifecycle müssen übereinstimmen.", path: ["permissionReview"] });
  }
  return issues;
}
