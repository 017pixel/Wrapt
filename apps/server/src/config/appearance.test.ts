import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultAppearanceTheme } from "@wrapt/contracts";
import { loadWraptConfig, persistAppearanceTheme, readAppearanceTheme, wraptConfigSchema } from "./wrapt-config.js";

describe("Projekt-Theme in der Konfiguration", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("liest fehlende Appearance-Werte mit dem Standard", () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-appearance-"));
    directories.push(directory);
    const example = readFileSync(resolve(process.cwd(), "../../config/wrapt.example.json"), "utf8");
    const config = JSON.parse(example) as Record<string, unknown>;
    delete config.appearance;
    writeFileSync(join(directory, "wrapt.local.json"), JSON.stringify(config), "utf8");

    expect(loadWraptConfig(directory).appearance).toEqual(defaultAppearanceTheme);
  });

  it("schreibt nur das Appearance-Teilobjekt und behält den Rest", () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-appearance-"));
    directories.push(directory);
    const example = readFileSync(resolve(process.cwd(), "../../config/wrapt.example.json"), "utf8");
    writeFileSync(join(directory, "wrapt.local.json"), example, "utf8");
    const next = { ...defaultAppearanceTheme, preset: "sage" as const };

    persistAppearanceTheme(directory, next);

    expect(readAppearanceTheme(directory)).toEqual(next);
    expect(loadWraptConfig(directory).paths.dataDir).toBe(wraptConfigSchema.parse(JSON.parse(example)).paths.dataDir);
  });
});
