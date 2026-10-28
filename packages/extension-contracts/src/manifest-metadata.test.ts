import { describe, expect, it } from "vitest";
import { EXTENSION_KEYWORDS_MAX_COUNT, extensionEntrypointsSchema, extensionManifestV1Schema, extensionPackagePathSchema, extensionTrustLevelSchema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: metadata", () => {
  it("akzeptiert ein vollständiges lokales Manifest", () => {
      expect(extensionManifestV1Schema.parse(validManifest)).toEqual(
        validManifest,
      );
    });

  it("migriert das alte engines.remoteWorkplace beim Einlesen", () => {
      const result = extensionManifestV1Schema.parse({
        ...validManifest,
        engines: { remoteWorkplace: ">=0.44.0", extensionApi: "^1" },
      });
      expect(result.engines).toEqual({ wrapt: ">=0.44.0", extensionApi: "^1" });
    });

  it("akzeptiert ein Manifest ohne optionale Metadaten", () => {
      const manifest = {
        manifestVersion: 1,
        id: "workbench.agent-tasks",
        name: "Agent Tasks",
        version: "1.0.0",
        publisher: "wrapt",
        description: "Aufgaben und Agent Runs verwalten",
        license: "MIT",
        engines: { wrapt: ">=0.95.0", extensionApi: "^1" },
        trust: "catalog-first-party",
        entrypoints: { server: "./dist/server.js" },
        permissions: [],
        activationEvents: [],
        contributes: {},
      };

      expect(extensionManifestV1Schema.parse(manifest)).toEqual(manifest);
    });

  it("verlangt mindestens einen Entrypoint oder später eine Contribution", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: {},
          contributes: {},
        }).success,
      ).toBe(false);
    });

  it("weist unbekannte Felder auf allen definierten Ebenen ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          remoteRegistry: "https://example.com",
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          engines: { ...validManifest.engines, node: ">=22" },
        }).success,
      ).toBe(false);
      expect(
        extensionEntrypointsSchema.safeParse({
          ...validManifest.entrypoints,
          worker: "./dist/worker.js",
        }).success,
      ).toBe(false);
    });

  it.each([
      ["manifestVersion", { ...validManifest, manifestVersion: 2 }],
      ["ID", { ...validManifest, id: "Agent Tasks" }],
      ["Version", { ...validManifest, version: "v1.0.0" }],
      [
        "Workbench Range",
        {
          ...validManifest,
          engines: { ...validManifest.engines, wrapt: "latest" },
        },
      ],
      [
        "Extension API Range",
        {
          ...validManifest,
          engines: { ...validManifest.engines, extensionApi: " ^1" },
        },
      ],
      ["Trust", { ...validManifest, trust: "first-party" }],
      ["Data Schema Version", { ...validManifest, dataSchemaVersion: 0 }],
    ])("weist einen ungültigen Wert für %s ab", (_field, manifest) => {
      expect(extensionManifestV1Schema.safeParse(manifest).success).toBe(false);
    });

  it.each([
      "system",
      "builtin",
      "catalog-first-party",
      "developer",
      "sandboxed-webview",
    ])("akzeptiert das Trust Level %s", (trust) => {
      expect(extensionTrustLevelSchema.parse(trust)).toBe(trust);
    });

  it("weist nicht normalisierte Texte und doppelte Keywords ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          name: " Agent Tasks",
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          description: "Agent\nTasks",
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          keywords: ["Agent", "agent"],
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          keywords: Array.from(
            { length: EXTENSION_KEYWORDS_MAX_COUNT + 1 },
            (_, index) => `keyword-${index}`,
          ),
        }).success,
      ).toBe(false);
    });

  it.each([
      "../server.js",
      "/tmp/server.js",
      "./dist/../server.js",
      "./dist\\server.js",
      "./%2e%2e/server.js",
      "./dist/server.js?debug=1",
      "./dist/server.js#entry",
      "https://example.com/server.js",
      "file:///tmp/server.js",
    ])("weist den unsicheren oder nicht lokalen Paketpfad %s ab", (path) => {
      expect(extensionPackagePathSchema.safeParse(path).success).toBe(false);
      expect(extensionEntrypointsSchema.safeParse({ server: path }).success).toBe(
        false,
      );
    });

  it("begrenzt Entrypoint- und Asset-Dateitypen", () => {
      expect(
        extensionEntrypointsSchema.safeParse({ ui: "./dist/ui.ts" }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          icon: "./assets/icon.svg",
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          icon: "./assets/icon.PNG",
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          readme: "./README.html",
        }).success,
      ).toBe(false);
    });
});
