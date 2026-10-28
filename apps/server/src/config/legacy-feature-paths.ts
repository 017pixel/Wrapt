/** Historische Pfade lesen, ohne persönliche Konfigurationsdateien umzuschreiben. */
export function normalizeLegacyFeaturePaths(value: unknown): unknown {
  if (value === null || typeof value !== "object" || !("paths" in value)) return value;
  const paths = value.paths;
  if (paths === null || typeof paths !== "object") return value;
  const legacy = paths as Record<string, unknown>;
  return {
    ...value,
    paths: {
      ...legacy,
      projectBrowserRoot: legacy.projectBrowserRoot ?? legacy.orbitProjectBrowserRoot,
      legacyMediaDir: legacy.legacyMediaDir ?? legacy.orbitAssetDir,
    },
  };
}
