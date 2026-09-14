import { lstat, mkdir, readFile, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  skillEditorCreateResponseSchema,
  type SkillEditorCreateRequest,
  type SkillEditorCreateResponse,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { hasReadmeRow, readmeWithRenamedRow, readmeWithRow, readmeWithoutRow, withFrontmatterName } from "./skillEditorText.js";

export interface SkillMutationHost {
  skillsDirectory: string;
  propagateDirectories: string[];
  repositoryDirectory: string | null;
  physicalBase(): Promise<string>;
  physicalPath(name: string): string;
  assertAllowedTarget(canonical: string): void;
}

interface ReadmeResult { updated: boolean; notice: string | null; }

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
 * Idempotente Dateisystem-Schritte der Skill-Lebenszyklen. Jede Funktion darf
 * nach einem Abbruch vollständig erneut laufen: Sie erkennt bereits erledigte
 * Schritte am Zustand und führt nur die fehlenden aus. Genau darauf stützt sich
 * die Recovery aus dem Journal.
 */
export class SkillMutations {
  constructor(private readonly host: SkillMutationHost) {}

  private async readReadme(): Promise<{ path: string; content: string } | null> {
    const repository = this.host.repositoryDirectory;
    if (!repository) return null;
    const path = join(repository, "README.md");
    const content = await readFile(path, "utf8").catch(() => null);
    return content === null ? null : { path, content };
  }

  private async writeReadme(path: string, content: string): Promise<ReadmeResult> {
    await writeFile(path, content, "utf8");
    return { updated: true, notice: null };
  }

  private missingReadme(): ReadmeResult {
    return { updated: false, notice: "Die README des Skill-Repos wurde nicht gefunden; die Skill-Tabelle bleibt unverändert." };
  }

  private missingRow(): ReadmeResult {
    return { updated: false, notice: "In der README wurde keine passende Tabellenzeile gefunden; bitte manuell prüfen." };
  }

  async ensureReadmeRow(name: string, description: string): Promise<ReadmeResult> {
    const readme = await this.readReadme();
    if (!readme) return this.missingReadme();
    if (hasReadmeRow(readme.content, name)) return { updated: false, notice: null };
    const next = readmeWithRow(readme.content, name, description);
    return next === null ? this.missingRow() : this.writeReadme(readme.path, next);
  }

  async ensureReadmeRenamed(name: string, newName: string): Promise<ReadmeResult> {
    const readme = await this.readReadme();
    if (!readme) return this.missingReadme();
    if (hasReadmeRow(readme.content, newName)) return { updated: false, notice: null };
    const next = readmeWithRenamedRow(readme.content, name, newName);
    return next === null ? this.missingRow() : this.writeReadme(readme.path, next);
  }

  async ensureReadmeRemoved(name: string): Promise<ReadmeResult> {
    const readme = await this.readReadme();
    if (!readme) return this.missingReadme();
    if (!hasReadmeRow(readme.content, name)) return { updated: false, notice: null };
    const next = readmeWithoutRow(readme.content, name);
    return next === null ? this.missingRow() : this.writeReadme(readme.path, next);
  }

  async ensureSkillCreated(input: SkillEditorCreateRequest, onProgress?: () => void): Promise<SkillEditorCreateResponse> {
    const physicalBase = await this.host.physicalBase();
    const physical = join(physicalBase, input.name);
    const linkPath = join(this.host.skillsDirectory, input.name);
    onProgress?.();
    await mkdirp(physical);
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
    if (physical !== linkPath) {
      await mkdirp(this.host.skillsDirectory);
      if (!await exists(linkPath)) {
        onProgress?.();
        await symlink(physical, linkPath, "dir").catch(filesystemFailure);
      }
    }
    const propagated: string[] = [];
    for (const directory of this.host.propagateDirectories) {
      await mkdirp(directory);
      const target = join(directory, input.name);
      if (!await exists(target)) {
        onProgress?.();
        await symlink(linkPath, target, "dir").catch(filesystemFailure);
      }
      propagated.push(target);
    }
    onProgress?.();
    const readme = await this.ensureReadmeRow(input.name, input.description);
    return skillEditorCreateResponseSchema.parse({
      path: join(linkPath, "SKILL.md"),
      name: input.name,
      propagated,
      readmeUpdated: readme.updated,
      notice: readme.notice,
    });
  }

  async ensureSkillRenamed(input: { name: string; newName: string }, onProgress?: () => void): Promise<SkillEditorCreateResponse> {
    const skillsDirectory = this.host.skillsDirectory;
    const linkPath = join(skillsDirectory, input.name);
    const newLinkPath = join(skillsDirectory, input.newName);
    const physicalBase = await this.host.physicalBase();
    const oldPhysical = join(physicalBase, input.name);
    const newPhysical = join(physicalBase, input.newName);
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

    if (oldPhysical !== linkPath) {
      if (await exists(linkPath)) {
        onProgress?.();
        await unlinkIfPresent(linkPath);
      }
      if (!await exists(newLinkPath)) {
        onProgress?.();
        await symlink(newPhysical, newLinkPath, "dir").catch(filesystemFailure);
      }
    }
    const propagated: string[] = [];
    for (const directory of this.host.propagateDirectories) {
      const previous = join(directory, input.name);
      if (await exists(previous)) {
        onProgress?.();
        await unlinkIfPresent(previous);
      }
      const target = join(directory, input.newName);
      if (!await exists(target)) {
        onProgress?.();
        await symlink(newLinkPath, target, "dir").catch(filesystemFailure);
      }
      propagated.push(target);
    }
    const skillFile = join(newPhysical, "SKILL.md");
    const content = await readFile(skillFile, "utf8").catch(() => null);
    if (content !== null) {
      onProgress?.();
      await writeFile(skillFile, withFrontmatterName(content, input.newName), "utf8").catch(filesystemFailure);
    }
    onProgress?.();
    const readme = await this.ensureReadmeRenamed(input.name, input.newName);
    return skillEditorCreateResponseSchema.parse({
      path: join(newLinkPath, "SKILL.md"),
      name: input.newName,
      propagated,
      readmeUpdated: readme.updated,
      notice: readme.notice,
    });
  }

  async ensureSkillRemoved(name: string, onProgress?: () => void): Promise<void> {
    const skillsDirectory = this.host.skillsDirectory;
    const linkPath = join(skillsDirectory, name);
    // Erst die Verweise entfernen (nur den Link, nie das Ziel), dann den echten Ordner.
    for (const directory of this.host.propagateDirectories) {
      const target = join(directory, name);
      if (await exists(target)) {
        onProgress?.();
        await unlinkIfPresent(target);
      }
    }
    let physical: string | null = null;
    if (await exists(linkPath)) {
      physical = await realpath(linkPath).catch(() => null);
      const isLink = (await lstat(linkPath).catch(filesystemFailure)).isSymbolicLink();
      if (isLink) {
        onProgress?.();
        await unlinkIfPresent(linkPath);
      }
    }
    if (!physical) {
      const candidate = this.host.physicalPath(name);
      if (await exists(candidate)) physical = await realpath(candidate).catch(() => null);
    }
    if (physical) {
      this.host.assertAllowedTarget(physical);
      onProgress?.();
      await rm(physical, { recursive: true, force: true }).catch(filesystemFailure);
    }
    onProgress?.();
    await this.ensureReadmeRemoved(name);
  }
}

async function mkdirp(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
