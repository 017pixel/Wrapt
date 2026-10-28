/** Entfernte Canvas-Beiträge beim Lesen alter Pakete auslassen; alle übrigen Beiträge bleiben validiert. */
export function normalizeLegacyExtensionManifest(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const manifest = { ...value } as Record<string, unknown>;
  const contributions = manifest.contributes;
  if (contributions !== null && typeof contributions === "object" && !Array.isArray(contributions)) {
    const remaining = { ...contributions } as Record<string, unknown>;
    delete remaining.orbit;
    manifest.contributes = remaining;
  }
  if (Array.isArray(manifest.activationEvents)) {
    manifest.activationEvents = manifest.activationEvents.filter((event) => typeof event !== "string" || !event.startsWith("onOrbitNode:"));
  }
  return manifest;
}
