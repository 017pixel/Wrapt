import type { Dirent } from "node:fs";
import { access, constants, lstat, readdir, readFile, readlink, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HermesSkillEditorNode, SkillEditorRuleEntry } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import type { SkillFileStore } from "./skillEditorFiles.js";
import { parseSkillFrontmatter } from "./skillEditorText.js";

const HERMES_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Kategorie- und Skillnamen folgen denselben Regeln wie normale Skillnamen. */
export function assertHermesName(value: string, kind: "Skill" | "Kategorie"): void {
  if (!HERMES_NAME_PATTERN.test(value) || value.length > 64) {
    const label = kind === "Kategorie" ? "Der Kategoriename" : "Der Name";
    throw new AppError(400, "SKILLS_NAME_INVALID", `${label} darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.`);
  }
}

/**
 * Hermes-Platz aus der Regeldatei ableiten: <heim>/hermes-agent/AGENTS.md
 * gehört zu <heim>, die Rückverweise liegen unter <heim>/skills. Bei
 * abweichender Ablage gibt es keinen Platz — dann ohne Verweis arbeiten.
 */
export function hermesLinkBaseFor(hermesAgentsPath: string | null): string | null {
  if (!hermesAgentsPath) return null;
  if (dirname(dirname(hermesAgentsPath)) === dirname(hermesAgentsPath)) return null;
  return join(dirname(dirname(hermesAgentsPath)), "skills");
}

/** Alle Kategorien mit ihren Skills unter hermes-skills/ auflisten. */
export async function listHermesSkills(hermesSkillsDirectory: string, files: SkillFileStore): Promise<HermesSkillEditorNode[]> {
  let categories: Dirent[];
  try {
    categories = await readdir(hermesSkillsDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  categories.sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }));
  const nodes: HermesSkillEditorNode[] = [];
  for (const category of categories) {
    if (category.name.startsWith(".")) continue;
    const categoryPath = join(hermesSkillsDirectory, category.name);
    const categoryDetails = await stat(categoryPath).catch(() => null);
    if (!categoryDetails?.isDirectory()) continue;
    let skills: Dirent[];
    try {
      skills = await readdir(categoryPath, { withFileTypes: true });
    } catch {
      continue;
    }
    skills.sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }));
    for (const skill of skills) {
      if (skill.name.startsWith(".")) continue;
      const path = join(categoryPath, skill.name);
      const details = await stat(path).catch(() => null);
      // Nur Skill-Ordner (und kaputte Verweise) gehören in den Baum.
      if (details && !details.isDirectory()) continue;
      const broken = details === null;
      let description: string | null = null;
      if (!broken) {
        const frontmatter = await readFile(join(path, "SKILL.md"), "utf8").then(parseSkillFrontmatter).catch(() => ({} as Record<string, string>));
        description = frontmatter.description ?? null;
      }
      nodes.push({
        name: skill.name,
        path,
        description,
        modifiedAt: details ? details.mtime.toISOString() : null,
        symlink: skill.isSymbolicLink(),
        broken,
        files: broken ? [] : await files.walk(path, 0),
        category: category.name,
      });
    }
  }
  return nodes;
}

export interface HermesSkillLocation {
  category: string;
  path: string;
}

/** Skill über alle Kategorien suchen; mehrdeutige Namen werden abgelehnt. */
export async function findHermesSkill(hermesSkillsDirectory: string, name: string): Promise<HermesSkillLocation> {
  const matches: HermesSkillLocation[] = [];
  let categories: Dirent[];
  try {
    categories = await readdir(hermesSkillsDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AppError(404, "SKILLS_NOT_FOUND", "Dieser Hermes-Skill wurde nicht gefunden.");
    }
    throw error;
  }
  for (const category of categories) {
    if (category.name.startsWith(".")) continue;
    const candidate = join(hermesSkillsDirectory, category.name, name);
    try {
      await lstat(candidate);
      matches.push({ category: category.name, path: candidate });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (matches.length === 0) throw new AppError(404, "SKILLS_NOT_FOUND", "Dieser Hermes-Skill wurde nicht gefunden.");
  if (matches.length > 1) {
    throw new AppError(409, "SKILLS_NAME_AMBIGUOUS", `Der Name „${name}" kommt in mehreren Hermes-Kategorien vor. Bitte manuell auflösen.`);
  }
  return matches[0]!;
}

/** True, wenn der Name in irgendeiner Hermes-Kategorie belegt ist. */
export async function hermesNameTaken(hermesSkillsDirectory: string, name: string): Promise<boolean> {
  try {
    await findHermesSkill(hermesSkillsDirectory, name);
    return true;
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) return false;
    throw error;
  }
}

async function describeRuleFile(id: string, label: string, path: string, maxFileBytes: number): Promise<SkillEditorRuleEntry> {
  let link: Awaited<ReturnType<typeof lstat>> | null = null;
  try {
    link = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Fehlt die Datei, bleibt der Eintrag sichtbar, aber nicht bearbeitbar.
  if (!link) return { id, label, path, editable: false, symlinkTarget: null };
  let symlinkTarget: string | null = null;
  if (link.isSymbolicLink()) symlinkTarget = await readlink(path).catch(() => null);
  const details = await stat(path).catch(() => null);
  let editable = Boolean(details?.isFile() && (details?.size ?? 0) <= maxFileBytes);
  if (editable) {
    // Beschreibbar heißt hier: der Server darf wirklich schreiben.
    editable = await access(path, constants.W_OK).then(() => true).catch(() => false);
  }
  return { id, label, path, editable, symlinkTarget };
}

/** Globale Regeleinträge: Harness-Regeln plus — falls konfiguriert — Hermes-Regeln. */
export async function listRuleEntries(input: { rootDirectory: string; hermesAgentsPath: string | null; maxFileBytes: number }): Promise<SkillEditorRuleEntry[]> {
  const entries = [await describeRuleFile("global", "AGENTS.md global", join(input.rootDirectory, "AGENTS.md"), input.maxFileBytes)];
  if (input.hermesAgentsPath) {
    entries.push(await describeRuleFile("hermes", "Hermes AGENTS.md", input.hermesAgentsPath, input.maxFileBytes));
  }
  return entries;
}
