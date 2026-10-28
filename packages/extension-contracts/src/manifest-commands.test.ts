import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: commands", () => {
  it("akzeptiert strikt deklarierte Command Contributions", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: ["onCommand:workbench.agent-tasks.command.create"],
        }).success,
      ).toBe(true);
    });

  it("weist fremde, doppelte und handlerlose Command Contributions ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: [
              {
                id: "workbench.other.command.create",
                title: "Aufgabe erstellen",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: [
              {
                id: "workbench.agent-tasks.command.create",
                title: "Aufgabe erstellen",
              },
              {
                id: "workbench.agent-tasks.command.create",
                title: "Andere Anzeige",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({ ...validManifest, entrypoints: {} })
          .success,
      ).toBe(false);
    });

  it("verlangt für onCommand ein tatsächlich deklariertes Command-Ziel", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: ["onCommand:workbench.agent-tasks.command.missing"],
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: ["onRoute:workbench.agent-tasks.route.main"],
        }).success,
      ).toBe(true);
    });

  it("bindet Keyboard Shortcuts an tatsächlich deklarierte Commands", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            keyboardShortcuts: validManifest.contributes.keyboardShortcuts,
          },
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            keyboardShortcuts: [
              {
                ...validManifest.contributes.keyboardShortcuts[0],
                commandId: "workbench.agent-tasks.command.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
