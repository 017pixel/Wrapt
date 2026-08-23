import type { ExtensionLifecycleState } from "@wrapt/extension-contracts";

const labels: Record<ExtensionLifecycleState, string> = {
  available: "Verfügbar",
  staging: "Wird vorbereitet",
  installing: "Wird installiert",
  "permissions-pending": "Berechtigungen offen",
  installed: "Installiert",
  disabled: "Deaktiviert",
  enabling: "Wird aktiviert",
  activating: "Startet",
  active: "Aktiv",
  deactivating: "Wird deaktiviert",
  crashed: "Fehler",
  quarantined: "Quarantäne",
  incompatible: "Nicht kompatibel",
  "update-available": "Update verfügbar",
  updating: "Wird aktualisiert",
  "migration-failed": "Migration fehlgeschlagen",
  uninstalling: "Wird entfernt",
};

export function pluginLifecycleLabel(lifecycle: ExtensionLifecycleState): string {
  return labels[lifecycle];
}

export function pluginLifecycleTone(lifecycle: ExtensionLifecycleState): "default" | "ok" | "warn" | "bad" {
  if (lifecycle === "active") return "ok";
  if (["crashed", "quarantined", "incompatible", "migration-failed"].includes(lifecycle)) return "bad";
  if (["disabled", "installed", "permissions-pending", "update-available"].includes(lifecycle)) return "warn";
  return "default";
}
