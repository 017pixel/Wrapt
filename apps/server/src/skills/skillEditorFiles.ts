import type { Dirent, Stats } from "node:fs";
import { chmod, lstat, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import {
  skillEditorReadResponseSchema,
  type SkillEditorFile,
  type SkillEditorReadResponse,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { contained } from "../utils/pathRoots.js";

const MAXIMUM_TREE_DEPTH = 8;

export interface SkillFileAccess {
  /** Ordner, der im Baum erscheint (globales Harness-Verzeichnis). */
  rootDirectory: string;
  /** Hermes-Skillquelle; ohne Angabe entfallen Hermes-Pfade. */
  hermesSkillsDirectory: string | null;
  /** Globale Hermes-Regeln als Einzeldatei; ohne Angabe entfällt der Eintrag. */
  hermesAgentsPath: string | null;
  /** Aufgelöste Ziele müssen in einem dieser Bereiche landen. */
  allowedRoots: string[];
  maxFileBytes: number;
}

function filesystemFailure(error: unknown): never {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") throw new AppError(404, "SKILLS_PATH_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
  if (code === "EACCES" || code === "EPERM") throw new AppError(403, "SKILLS_PATH_INACCESSIBLE", "Diese Datei ist nicht lesbar.");
  throw error;
}

/** `stat` mit Symlink-Auflösung; `null` steht für einen Verweis ins Leere. */
async function statOrNull(path: string): Promise<Stats | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
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

/**
 * Inhaltsgebundener Revisionstoken aus Mtime, Größe und SHA-256 des Inhalts.
 * Nur so lässt sich eine externe Änderung von einer reinen Berührung der Datei
 * unterscheiden und ein stiller Überschreibvorgang ausschließen.
 */
function revisionTokenOf(details: Stats, buffer: Buffer): string {
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  return createHash("sha256").update(`${details.mtimeMs}\n${details.size}\n${contentHash}`).digest("hex");
}

/**
 * Pfadbasierter Dateizugriff für alle Skill-Gruppen. Die Prüfung bleibt
 * bewusst zweistufig: erst die lexikalische Lage, dann das aufgelöste Ziel.
 */
export class SkillFileStore {
  constructor(private readonly access: SkillFileAccess) {}

  async fileEntry(path: string, name = basename(path)): Promise<SkillEditorFile | null> {
    let link: Stats;
    try {
      link = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const isSymbolicLink = link.isSymbolicLink();
    // Kaputter Verweis: bleibt im Baum sichtbar, ist aber nicht bearbeitbar.
    const details = await statOrNull(path);
    if (details && !details.isFile() && !details.isDirectory()) return null;
    const kind: SkillEditorFile["kind"] = details?.isDirectory() ? "directory" : "file";
    return {
      name,
      path,
      kind,
      sizeBytes: details?.isFile() ? details.size : null,
      modifiedAt: details ? details.mtime.toISOString() : null,
      symlink: isSymbolicLink,
      broken: details === null,
      editable: Boolean(details?.isFile() && details.size <= this.access.maxFileBytes),
    };
  }

  async walk(directory: string, depth: number): Promise<SkillEditorFile[]> {
    if (depth >= MAXIMUM_TREE_DEPTH) return [];
    let dirents: Dirent[];
    try {
      dirents = await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }
    dirents.sort((left, right) => {
      // `SKILL.md` gehört nach oben: sie ist die Datei, die fast immer gemeint ist.
      if (depth === 0 && (left.name === "SKILL.md" || right.name === "SKILL.md")) {
        return Number(right.name === "SKILL.md") - Number(left.name === "SKILL.md");
      }
      return left.name.localeCompare(right.name, "de", { sensitivity: "base" });
    });
    const files: SkillEditorFile[] = [];
    for (const dirent of dirents) {
      if (dirent.name === ".git" || dirent.name === "node_modules") continue;
      const path = join(directory, dirent.name);
      const entry = await this.fileEntry(path, dirent.name);
      if (!entry) continue;
      files.push(entry);
      if (entry.kind === "directory" && !entry.broken) files.push(...await this.walk(path, depth + 1));
    }
    return files;
  }

  /**
   * Der angeforderte Pfad muss vor der Auflösung in einem bekannten Bereich
   * liegen. Die Hermes-Regeldatei ist eine explizit konfigurierte Einzeldatei
   * und wird am exakten Pfad erkannt statt über einen Ordner.
   */
  private requestedPath(input: string): string {
    const value = input.trim();
    if (!value) throw new AppError(400, "SKILLS_PATH_REQUIRED", "Es wurde kein Pfad angegeben.");
    const requested = isAbsolute(value) ? normalize(value) : resolve(this.access.rootDirectory, value);
    if (this.access.hermesAgentsPath && normalize(requested) === normalize(this.access.hermesAgentsPath)) return requested;
    const bases = [this.access.rootDirectory, ...(this.access.hermesSkillsDirectory ? [this.access.hermesSkillsDirectory] : [])];
    if (!bases.some((base) => contained(base, requested))) {
      throw new AppError(403, "SKILLS_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des Skill-Ordners.");
    }
    return requested;
  }

  private assertAllowedTarget(canonical: string): void {
    if (this.access.allowedRoots.some((root) => contained(root, canonical))) return;
    throw new AppError(403, "SKILLS_PATH_OUTSIDE_ROOT", "Der Verweis führt aus den erlaubten Skill-Ordnern heraus.");
  }

  /** Pfad auflösen und auf Datei/Ordner prüfen; kaputte Verweise werden benannt. */
  private async resolveExisting(input: string, expect: "file" | "directory"): Promise<{ requested: string; canonical: string; details: Stats }> {
    const requested = this.requestedPath(input);
    let details: Stats;
    try {
      details = await stat(requested);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && await exists(requested)) {
        throw new AppError(409, "SKILLS_SYMLINK_BROKEN", "Dieser Verweis zeigt ins Leere. Das Ziel wurde verschoben oder gelöscht.");
      }
      filesystemFailure(error);
    }
    if (expect === "file" && !details.isFile()) throw new AppError(400, "SKILLS_PATH_NOT_FILE", "Der angegebene Pfad ist keine Datei.");
    if (expect === "directory" && !details.isDirectory()) throw new AppError(400, "SKILLS_PATH_NOT_DIRECTORY", "Der angegebene Pfad ist kein Ordner.");
    const canonical = await realpath(requested).catch(filesystemFailure);
    // Die Hermes-Regeldatei ist als Einzeldatei konfiguriert; ihr Ziel liegt
    // bewusst außerhalb der Skill-Roots und braucht keine Bereichsprüfung.
    if (!(this.access.hermesAgentsPath && normalize(requested) === normalize(this.access.hermesAgentsPath))) {
      this.assertAllowedTarget(canonical);
    }
    return { requested, canonical, details };
  }

  async readFile(input: { path: string }): Promise<SkillEditorReadResponse> {
    const { requested, canonical, details } = await this.resolveExisting(input.path, "file");
    if (details.size > this.access.maxFileBytes) {
      throw new AppError(413, "SKILLS_FILE_TOO_LARGE", "Diese Datei ist zu groß für den Editor.", { limitBytes: this.access.maxFileBytes });
    }
    const buffer = await readFile(canonical).catch(filesystemFailure);
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw new AppError(415, "SKILLS_NOT_TEXT", "Diese Datei ist kein Textdokument und kann nicht bearbeitet werden.");
    }
    return skillEditorReadResponseSchema.parse({
      path: requested,
      name: basename(requested),
      content,
      modifiedAt: details.mtime.toISOString(),
      sizeBytes: details.size,
      revisionToken: revisionTokenOf(details, buffer),
    });
  }

  /** Aktueller Revisionstoken einer Datei (frisch gelesen). */
  private async revisionAt(canonical: string): Promise<{ token: string; modifiedAt: string }> {
    const details = await stat(canonical).catch(filesystemFailure);
    if (details.size > this.access.maxFileBytes) {
      throw new AppError(413, "SKILLS_FILE_TOO_LARGE", "Diese Datei ist zu groß für den Editor.", { limitBytes: this.access.maxFileBytes });
    }
    const buffer = await readFile(canonical).catch(filesystemFailure);
    return { token: revisionTokenOf(details, buffer), modifiedAt: details.mtime.toISOString() };
  }

  /**
   * Atomar und bedingt schreiben: Temp-Datei im Zielverzeichnis, erneute
   * Token-Prüfung unmittelbar vor dem `rename`, dann atomarer Replace. Eine
   * externe Änderung wird damit nie still überschrieben; der erfolgreiche Save
   * bezieht sich auf genau den geprüften Revisionstoken.
   */
  async writeFile(input: { path: string; content: string; expectedRevision?: string | null | undefined; expectedModifiedAt?: string | null | undefined }): Promise<SkillEditorReadResponse> {
    const { requested, canonical, details } = await this.resolveExisting(input.path, "file");
    if (input.content.length > this.access.maxFileBytes) {
      throw new AppError(413, "SKILLS_FILE_TOO_LARGE", "Der Inhalt überschreitet das Größenlimit.", { limitBytes: this.access.maxFileBytes });
    }
    const currentBuffer = await readFile(canonical).catch(filesystemFailure);
    const current = { token: revisionTokenOf(details, currentBuffer), modifiedAt: details.mtime.toISOString() };
    if (input.expectedRevision !== undefined && input.expectedRevision !== null && input.expectedRevision !== current.token) {
      throw new AppError(409, "SKILLS_CONFLICT", "Diese Datei wurde zwischenzeitlich außerhalb der Workbench geändert.", { serverModifiedAt: current.modifiedAt, revisionToken: current.token });
    }
    if ((input.expectedRevision === undefined || input.expectedRevision === null)
      && input.expectedModifiedAt != null && input.expectedModifiedAt !== current.modifiedAt) {
      // Legacy-Erwartungswert älterer Clients: mtime allein ist schwächer,
      // wird aber weiterhin als Konfliktsignal behandelt.
      throw new AppError(409, "SKILLS_CONFLICT", "Diese Datei wurde zwischenzeitlich außerhalb der Workbench geändert.", { serverModifiedAt: current.modifiedAt, revisionToken: current.token });
    }
    const temporary = join(dirname(canonical), `.wrapt-skill-${process.pid}-${Date.now()}.tmp`);
    try {
      await writeFile(temporary, input.content, { encoding: "utf8", mode: 0o600 });
      // Bestehende Rechte übernehmen, damit eine Bearbeitung keine Datei-Rechte verschiebt.
      await chmod(temporary, details.mode & 0o777);
      const beforeReplace = await this.revisionAt(canonical);
      if (beforeReplace.token !== current.token) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw new AppError(409, "SKILLS_CONFLICT", "Diese Datei wurde während des Speicherns außerhalb der Workbench geändert.", { serverModifiedAt: beforeReplace.modifiedAt, revisionToken: beforeReplace.token });
      }
      await rename(temporary, canonical);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    return this.readFile({ path: requested });
  }
}
