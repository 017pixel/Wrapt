import { readFile, stat } from "node:fs/promises";
import { pluginCreatorSkillResponseSchema } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

const MAXIMUM_SKILL_BYTES = 262_144;

export async function readWraptPluginsSkill(path: string) {
  let details;
  try {
    details = await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AppError(404, "PLUGIN_CREATOR_SKILL_NOT_FOUND", "Der Wrapt-Plugins-Skill wurde nicht gefunden. Prüfe plugins.wraptPluginsSkillPath in der Wrapt-Konfiguration.");
    }
    throw error;
  }
  if (!details.isFile()) {
    throw new AppError(400, "PLUGIN_CREATOR_SKILL_NOT_FILE", "Der konfigurierte Wrapt-Plugins-Pfad zeigt nicht auf eine Datei.");
  }
  if (details.size > MAXIMUM_SKILL_BYTES) {
    throw new AppError(413, "PLUGIN_CREATOR_SKILL_TOO_LARGE", "Der Wrapt-Plugins-Skill überschreitet das Dateigrößenlimit.");
  }
  const buffer = await readFile(path);
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new AppError(415, "PLUGIN_CREATOR_SKILL_NOT_TEXT", "Der Wrapt-Plugins-Skill ist keine gültige UTF-8-Textdatei.");
  }
  return pluginCreatorSkillResponseSchema.parse({
    fileName: "SKILL.md",
    content,
    modifiedAt: details.mtime.toISOString(),
    sizeBytes: details.size,
  });
}

/** Kompatibilitätsalias für bereits importierende Server-Module. */
export const readPluginCreatorSkill = readWraptPluginsSkill;
