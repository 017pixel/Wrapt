import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadWraptConfig, persistMascotConfig, readMascotConfig } from "./wrapt-config.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const directories: string[] = [];

function createConfigDirectory(withMascot: boolean): string {
  const config = JSON.parse(
    readFileSync(join(repositoryRoot, "config/wrapt.example.json"), "utf8"),
  ) as Record<string, unknown>;
  if (withMascot) config.mascot = { enabled: true };
  else delete config.mascot;
  const directory = mkdtempSync(join(tmpdir(), "wrapt-mascot-config-"));
  directories.push(directory);
  writeFileSync(join(directory, "wrapt.local.json"), JSON.stringify(config), "utf8");
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Maskottchen-Konfiguration", () => {
  it("ist ohne eigenen Abschnitt standardmäßig deaktiviert", () => {
    expect(readMascotConfig(createConfigDirectory(false))).toEqual({ enabled: false });
  });

  it("bewahrt eine ausdrücklich aktivierte Einstellung", () => {
    expect(readMascotConfig(createConfigDirectory(true))).toEqual({ enabled: true });
  });

  it("schreibt nur den Maskottchen-Abschnitt atomar", () => {
    const directory = createConfigDirectory(false);
    persistMascotConfig(directory, { enabled: false });

    expect(readMascotConfig(directory)).toEqual({ enabled: false });
    expect(loadWraptConfig(directory).paths.projectsRoot).toBe(
      loadWraptConfig(createConfigDirectory(true)).paths.projectsRoot,
    );
  });
});
