import { lstat, mkdir, readFile, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  skillEditorCreateResponseSchema,
  type HermesSkillEditorCreateRequest,
  type SkillEditorCreateResponse,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { withFrontmatterName } from "./skillEditorText.js";

export interface HermesMutationHost {
  /** Quelle der Hermes-Skills (hermes-skills/ im Skills-Repo). */
  hermesSkillsDirectory: string;
  /** Hermes-Platz für Rückverweise (<heim>/skills); ohne Angabe ohne Verweis. */
  linkBase: string | null;
  assertAllowedTarget(canonical: string): void;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function filesystemFailure(error: unknown): never {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") throw new AppError(404, "SKILLS_PATH_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
  if (code === "EACCES" || code === "EPERM") throw new AppError(403, "SKILLS_PATH_INACCESSIBLE", "Diese Datei ist nicht lesbar.");
  throw error;
}

/** Entfernt einen Verweis; fehlt er bereits, ist das Ziel erreicht. */
async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    filesystemFailure(error);
  }
}

/**
 * Idempotente Dateisystem-Schritte der Hermes-Lebenszyklen. Wie bei normalen
 * Skills darf jede Funktion nach einem Abbruch erneut laufen. Die Quelle liegt
 * im Repo (hermes-skills/<kategorie>/<name>), der Rückverweis am Hermes-Platz
 * zeigt dorthin — dieselbe Richtung wie im Bestand.
 */
export class HermesMutations {
  constructor(private readonly host: HermesMutationHost) {}

  private linkPath(category: string, name: string): string | null {
    return this.host.linkBase ? join(this.host.linkBase, category, name) : null;
  }

  private missingLinkNotice(): string | null {
    return this.host.linkBase
      ? null
      : "Kein Hermes-Verzeichnis konfiguriert; der Rückverweis am Hermes-Platz wurde nicht erstellt.";
  }

  async ensureHermesSkillCreated(input: HermesSkillEditorCreateRequest, onProgress?: () => void): Promise<SkillEditorCreateResponse> {
    const physical = join(this.host.hermesSkillsDirectory, input.category, input.name);
    onProgress?.();
    await mkdir(physical, { recursive: true });
    this.host.assertAllowedTarget(await realpath(physical).catch(filesystemFailure));
    const skillFile = join(physical, "SKILL.md");
    if (!await exists(skillFile)) {
      const frontmatter = [
        "---",
        `name: ${input.name}`,
        `description: ${input.description.replace(/\r?\n/g, " ")}`,
        ...(input.license ? [`license: ${input.license}`] : []),
        "---",
        "",
        `# ${input.name}`,
        "",
      ].join("\n");
      onProgress?.();
      await writeFile(skillFile, frontmatter, { encoding: "utf8", mode: 0o644 }).catch(filesystemFailure);
    }
    const propagated: string[] = [];
    const link = this.linkPath(input.category, input.name);
    if (link) {
      await mkdir(join(this.host.linkBase!, input.category), { recursive: true });
      if (!await exists(link)) {
        onProgress?.();
        await symlink(physical, link, "dir").catch(filesystemFailure);
      }
      propagated.push(link);
    }
    onProgress?.();
    return skillEditorCreateResponseSchema.parse({
      path: join(physical, "SKILL.md"),
      name: input.name,
      propagated,
      readmeUpdated: false,
      notice: this.missingLinkNotice(),
    });
  }

  async ensureHermesSkillRenamed(input: { category: string; name: string; newName: string }, onProgress?: () => void): Promise<SkillEditorCreateResponse> {
    const base = join(this.host.hermesSkillsDirectory, input.category);
    const oldPhysical = join(base, input.name);
    const newPhysical = join(base, input.newName);
    const oldExists = await exists(oldPhysical);
    const newExists = await exists(newPhysical);
    if (oldExists && newExists) {
      throw new AppError(409, "SKILLS_RECOVERY_REQUIRED", "Die Umbenennung ist unklar: alter und neuer Skill-Ordner existieren. Bitte manuell prüfen.");
    }
    if (!oldExists && !newExists) {
      throw new AppError(409, "SKILLS_RECOVERY_REQUIRED", "Die Umbenennung kann nicht wiederaufgenommen werden: kein Skill-Ordner gefunden.");
    }
    if (oldExists) {
      onProgress?.();
      await rename(oldPhysical, newPhysical).catch(filesystemFailure);
    }
    this.host.assertAllowedTarget(await realpath(newPhysical).catch(filesystemFailure));

    const propagated: string[] = [];
    const previousLink = this.linkPath(input.category, input.name);
    if (previousLink && await exists(previousLink)) {
      onProgress?.();
      await unlinkIfPresent(previousLink);
    }
    const link = this.linkPath(input.category, input.newName);
    if (link) {
      await mkdir(join(this.host.linkBase!, input.category), { recursive: true });
      if (!await exists(link)) {
        onProgress?.();
        await symlink(newPhysical, link, "dir").catch(filesystemFailure);
      }
      propagated.push(link);
    }
    const skillFile = join(newPhysical, "SKILL.md");
    const content = await readFile(skillFile, "utf8").catch(() => null);
    if (content !== null) {
      onProgress?.();
      await writeFile(skillFile, withFrontmatterName(content, input.newName), "utf8").catch(filesystemFailure);
    }
    onProgress?.();
    return skillEditorCreateResponseSchema.parse({
      path: join(newPhysical, "SKILL.md"),
      name: input.newName,
      propagated,
      readmeUpdated: false,
      notice: this.missingLinkNotice(),
    });
  }

  async ensureHermesSkillRemoved(category: string, name: string, onProgress?: () => void): Promise<void> {
    // Erst den Verweis entfernen (nur den Link, nie das Ziel), dann den echten Ordner.
    const link = this.linkPath(category, name);
    if (link && await exists(link)) {
      onProgress?.();
      await unlinkIfPresent(link);
    }
    const physical = join(this.host.hermesSkillsDirectory, category, name);
    if (await exists(physical)) {
      const canonical = await realpath(physical).catch(() => null);
      if (canonical) this.host.assertAllowedTarget(canonical);
      onProgress?.();
      await rm(physical, { recursive: true, force: true }).catch(filesystemFailure);
    }
    onProgress?.();
  }
}
