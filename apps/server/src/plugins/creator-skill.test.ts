import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppError } from "../utils/errors.js";
import { readPluginCreatorSkill } from "./creator-skill.js";

const directories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-plugin-creator-"));
  directories.push(directory);
  return directory;
}

describe("Plugin-Creator-Skill", () => {
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("liefert ausschließlich die konfigurierte UTF-8-Datei", async () => {
    const path = join(temporaryDirectory(), "SKILL.md");
    writeFileSync(path, "---\nname: plugin-creator\n---\n", "utf8");
    const result = await readPluginCreatorSkill(path);
    expect(result).toMatchObject({ fileName: "SKILL.md", content: expect.stringContaining("plugin-creator") });
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("meldet fehlende und ungültige Quellen ohne Dateiinhalte preiszugeben", async () => {
    const directory = temporaryDirectory();
    await expect(readPluginCreatorSkill(join(directory, "fehlt.md"))).rejects.toMatchObject({ statusCode: 404, code: "PLUGIN_CREATOR_SKILL_NOT_FOUND" } satisfies Partial<AppError>);
    const nested = join(directory, "ordner");
    mkdirSync(nested);
    await expect(readPluginCreatorSkill(nested)).rejects.toMatchObject({ statusCode: 400, code: "PLUGIN_CREATOR_SKILL_NOT_FILE" } satisfies Partial<AppError>);
  });

  it("weist zu große und nicht als UTF-8 lesbare Dateien zurück", async () => {
    const directory = temporaryDirectory();
    const large = join(directory, "gross.md");
    writeFileSync(large, Buffer.alloc(262_145, 97));
    await expect(readPluginCreatorSkill(large)).rejects.toMatchObject({ statusCode: 413, code: "PLUGIN_CREATOR_SKILL_TOO_LARGE" } satisfies Partial<AppError>);
    const binary = join(directory, "binaer.md");
    writeFileSync(binary, Buffer.from([0xff, 0xfe, 0xfd]));
    await expect(readPluginCreatorSkill(binary)).rejects.toMatchObject({ statusCode: 415, code: "PLUGIN_CREATOR_SKILL_NOT_TEXT" } satisfies Partial<AppError>);
  });
});
