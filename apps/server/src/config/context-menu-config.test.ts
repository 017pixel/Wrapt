import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadWraptConfig, persistContextMenuConfig, readContextMenuConfig } from "./wrapt-config.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const directories: string[] = [];

function createConfigDirectory(withContextMenu: boolean): string {
  const config = JSON.parse(
    readFileSync(join(repositoryRoot, "config/wrapt.example.json"), "utf8"),
  ) as Record<string, unknown>;
  if (!withContextMenu) delete config.contextMenu;
  const directory = mkdtempSync(join(tmpdir(), "wrapt-context-menu-config-"));
  directories.push(directory);
  writeFileSync(join(directory, "wrapt.local.json"), JSON.stringify(config), "utf8");
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Rechtsklick-Konfiguration", () => {
  it("ergänzt bei bestehenden Configs sichere Defaults", () => {
    expect(readContextMenuConfig(createConfigDirectory(false))).toEqual({
      enabled: true,
      quickActions: { mode: "auto", manual: [] },
      surfaces: {},
      statusBar: { fontSizePx: 12, alwaysShowLimits: false },
    });
  });

  it("schreibt nur den Context-Menu-Abschnitt atomar", () => {
    const directory = createConfigDirectory(false);
    persistContextMenuConfig(directory, {
      enabled: false,
      quickActions: { mode: "manual", manual: ["wrapt.files.navigation.main"] },
      surfaces: { "host.context-menu.browser": { enabled: false } },
      statusBar: { fontSizePx: 15, alwaysShowLimits: true },
    });

    expect(readContextMenuConfig(directory)).toMatchObject({
      enabled: false,
      statusBar: { fontSizePx: 15, alwaysShowLimits: true },
    });
    expect(loadWraptConfig(directory).paths.projectsRoot).toBe(
      loadWraptConfig(createConfigDirectory(true)).paths.projectsRoot,
    );
  });

  it("weist unbekannte Surfaces und Schriftgrößen außerhalb des Bereichs zurück", () => {
    const directory = createConfigDirectory(false);
    expect(() => persistContextMenuConfig(directory, {
      enabled: true,
      quickActions: { mode: "auto", manual: [] },
      surfaces: { "host.context-menu.unknown": { enabled: false } },
      statusBar: { fontSizePx: 21, alwaysShowLimits: false },
    } as never)).toThrowError();
  });
});
