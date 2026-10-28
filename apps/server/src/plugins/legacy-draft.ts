/** Alte Entwürfe bleiben lesbar; Quelldateien werden dabei nicht verändert. */
export function normalizeLegacyPluginDraft(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const content = { ...value } as Record<string, unknown>;
  const { wizard, surfaces, surfaceContributions } = content;
  delete content.orbit;
  const cleanedWizard = wizard !== null && typeof wizard === "object" && !Array.isArray(wizard)
    ? (() => {
      const answers = { ...wizard } as Record<string, unknown>;
      const wizardSurfaces = answers.surfaces;
      delete answers.includeOrbit;
      return { ...answers, ...(Array.isArray(wizardSurfaces) ? { surfaces: wizardSurfaces.filter((surface) => surface !== "orbit") } : {}) };
    })()
    : wizard;
  return {
    ...content,
    wizard: cleanedWizard,
    ...(Array.isArray(surfaces) ? { surfaces: surfaces.filter((surface) => surface !== "orbit") } : {}),
    ...(Array.isArray(surfaceContributions) ? {
      surfaceContributions: surfaceContributions.filter((item) => item?.surface !== "orbit"),
    } : {}),
  };
}
