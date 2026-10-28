import { expect, it } from "vitest";
import { normalizeLegacyFeaturePaths } from "./legacy-feature-paths.js";

it("erhält historische Projektbrowser-Grenzen ohne neue Werte oder Quelldaten zu überschreiben", () => {
  const value = { paths: { orbitProjectBrowserRoot: "/bestehend", orbitAssetDir: "/medien", projectsRoot: "/projekte" } };
  expect(normalizeLegacyFeaturePaths(value)).toMatchObject({ paths: { projectBrowserRoot: "/bestehend", legacyMediaDir: "/medien", projectsRoot: "/projekte" } });
  expect(value.paths).not.toHaveProperty("projectBrowserRoot");
  expect(normalizeLegacyFeaturePaths({ paths: { ...value.paths, projectBrowserRoot: "/neu" } }))
    .toMatchObject({ paths: { projectBrowserRoot: "/neu" } });
});
