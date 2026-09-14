import type { Dirent, Stats } from "node:fs";
import { chmod, lstat, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import {
  skillEditorReadResponseSchema,
  skillEditorStatusResponseSchema,
  skillEditorTreeResponseSchema,
  type SkillEditorCreateRequest,
  type SkillEditorCreateResponse,
  type SkillEditorFile,
  type SkillEditorGitPreviewResponse,
  type SkillEditorGitResponse,
  type SkillEditorNode,
  type SkillEditorReadResponse,
  type SkillEditorStatusResponse,
  type SkillEditorTreeResponse,
} from "@wrapt/contracts";
import { execa } from "execa";
import { SkillGitRepository } from "./skillGitRepository.js";
import { SkillEditorJobStore, type SkillEditorJobOperation } from "./skillEditorJobs.js";
import { SkillMutations } from "./skillEditorMutations.js";
import { parseSkillFrontmatter } from "./skillEditorText.js";
import { AppError } from "../utils/errors.js";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAXIMUM_TREE_DEPTH = 8;

/** Journal-Schlüssel: gleiche Operation auf gleichen Namen ist wiederaufnehmbar. */
function jobKey(operation: SkillEditorJobOperation, name: string, newName: string | null): string {
  return `${operation}\u0000${name}\u0000${newName ?? ""}`;
}

export interface SkillEditorOptions {
  /** Ordner, der im Baum erscheint (globales Harness-Verzeichnis). */
  rootDirectory: string;
  /** Weitere Harness-Ordner, in die neue Skills per Symlink verteilt werden. */
  propagateDirectories: string[];
  /** Git-Repository mit den echten Skill-Ordnern; ohne Angabe entfällt der Git-Teil. */
  repositoryDirectory: string | null;
  autosaveDebounceMilliseconds: number;
  maxFileBytes: number;
  /** SQLite-Datei für das Recovery-Journal der Skill-Operationen. */
  jobDatabasePath: string;
}

function contained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
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

export {
  parseSkillFrontmatter,
  withFrontmatterName,
  readmeWithRow,
  readmeWithRenamedRow,
  readmeWithoutRow,
} from "./skillEditorText.js";

export class SkillEditorService {
  private readonly allowedRoots: string[];
  private readonly jobs: SkillEditorJobStore;
  private readonly mutations: SkillMutations;
  private readonly jobLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly options: SkillEditorOptions) {
    this.allowedRoots = [
      options.rootDirectory,
      ...options.propagateDirectories,
      ...(options.repositoryDirectory ? [options.repositoryDirectory] : []),
    ].map((path) => resolve(path));
    this.jobs = new SkillEditorJobStore(options.jobDatabasePath);
    this.mutations = new SkillMutations({
      skillsDirectory: this.skillsDirectory,
      propagateDirectories: options.propagateDirectories,
      repositoryDirectory: options.repositoryDirectory,
      physicalBase: () => this.physicalBase(),
      physicalPath: (name) => this.physicalPath(name),
      assertAllowedTarget: (canonical) => this.assertAllowedTarget(canonical),
    });
  }

  close() { this.jobs.close(); }

  get skillsDirectory(): string {
    return join(this.options.rootDirectory, "skills");
  }

  // --- Pfadprüfung ----------------------------------------------------------

  /**
   * Der angeforderte Pfad muss vor der Auflösung innerhalb des Root-Ordners liegen.
   * Anders als der Dateimanager folgt der Skill-Editor Symlinks bewusst — die Skills
   * *sind* Verweise ins Repository —, das Ziel muss aber in einem erlaubten Bereich landen.
   */
  private requestedPath(input: string): string {
    const value = input.trim();
    if (!value) throw new AppError(400, "SKILLS_PATH_REQUIRED", "Es wurde kein Pfad angegeben.");
    const requested = isAbsolute(value) ? normalize(value) : resolve(this.options.rootDirectory, value);
    if (!contained(this.options.rootDirectory, requested)) {
      throw new AppError(403, "SKILLS_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des Skill-Ordners.");
    }
    return requested;
  }

  private assertAllowedTarget(canonical: string): void {
    if (this.allowedRoots.some((root) => contained(root, canonical))) return;
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
    this.assertAllowedTarget(canonical);
    return { requested, canonical, details };
  }

  // --- Baum -----------------------------------------------------------------

  private async fileEntry(path: string, name = basename(path)): Promise<SkillEditorFile | null> {
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
      editable: Boolean(details?.isFile() && details.size <= this.options.maxFileBytes),
    };
  }

  private async walk(directory: string, depth: number): Promise<SkillEditorFile[]> {
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

  async list(): Promise<SkillEditorTreeResponse> {
    const agentsFile = await this.fileEntry(join(this.options.rootDirectory, "AGENTS.md"));
    let dirents: Dirent[] = [];
    try {
      dirents = await readdir(this.skillsDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    dirents.sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }));

    const skills: SkillEditorNode[] = [];
    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;
      const path = join(this.skillsDirectory, dirent.name);
      const details = await statOrNull(path);
      // Nur Skill-Ordner (und kaputte Verweise, die einmal Ordner waren) gehören in den Baum.
      if (details && !details.isDirectory()) continue;
      const broken = details === null;
      let description: string | null = null;
      if (!broken) {
        const frontmatter = await readFile(join(path, "SKILL.md"), "utf8").then(parseSkillFrontmatter).catch(() => ({} as Record<string, string>));
        description = frontmatter.description ?? null;
      }
      skills.push({
        name: dirent.name,
        path,
        description,
        modifiedAt: details ? details.mtime.toISOString() : null,
        symlink: dirent.isSymbolicLink(),
        broken,
        files: broken ? [] : await this.walk(path, 0),
      });
    }
    return skillEditorTreeResponseSchema.parse({ rootDirectory: this.options.rootDirectory, agentsFile, skills });
  }

  async status(): Promise<SkillEditorStatusResponse> {
    return skillEditorStatusResponseSchema.parse({
      rootDirectory: this.options.rootDirectory,
      repositoryConfigured: this.options.repositoryDirectory !== null,
      repository: await this.repositoryStatus(),
      propagationTargets: this.options.propagateDirectories,
      autosaveDebounceMs: this.options.autosaveDebounceMilliseconds,
      maxFileBytes: this.options.maxFileBytes,
    });
  }

  private async repositoryStatus(): Promise<{ branch: string; dirtyCount: number } | null> {
    const repository = this.options.repositoryDirectory;
    if (!repository) return null;
    const [branch, changes] = await Promise.all([
      execa("git", ["-C", repository, "branch", "--show-current"], { reject: false, timeout: 5_000 }),
      execa("git", ["-C", repository, "status", "--porcelain"], { reject: false, timeout: 10_000 }),
    ]);
    if (branch.exitCode !== 0 || changes.exitCode !== 0) return null;
    const dirtyCount = changes.stdout.split("\n").filter((line) => line.trim() !== "").length;
    return { branch: branch.stdout.trim() || "HEAD", dirtyCount };
  }

  // --- Lesen und Schreiben --------------------------------------------------

  async readFile(input: { path: string }): Promise<SkillEditorReadResponse> {
    const { requested, canonical, details } = await this.resolveExisting(input.path, "file");
    if (details.size > this.options.maxFileBytes) {
      throw new AppError(413, "SKILLS_FILE_TOO_LARGE", "Diese Datei ist zu groß für den Editor.", { limitBytes: this.options.maxFileBytes });
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
    if (details.size > this.options.maxFileBytes) {
      throw new AppError(413, "SKILLS_FILE_TOO_LARGE", "Diese Datei ist zu groß für den Editor.", { limitBytes: this.options.maxFileBytes });
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
    if (input.content.length > this.options.maxFileBytes) {
      throw new AppError(413, "SKILLS_FILE_TOO_LARGE", "Der Inhalt überschreitet das Größenlimit.", { limitBytes: this.options.maxFileBytes });
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

  // --- Skills anlegen, umbenennen, löschen ----------------------------------

  private assertName(name: string): void {
    if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) {
      throw new AppError(400, "SKILLS_NAME_INVALID", "Der Name darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.");
    }
  }

  /** Alle Orte, an denen ein Skill mit diesem Namen sichtbar wird. */
  private linkTargets(name: string): string[] {
    return [join(this.skillsDirectory, name), ...this.options.propagateDirectories.map((directory) => join(directory, name))];
  }

  private physicalPath(name: string): string {
    const repository = this.options.repositoryDirectory;
    return repository ? join(repository, "skills", name) : join(this.skillsDirectory, name);
  }

  private async physicalBase(): Promise<string> {
    const repository = this.options.repositoryDirectory;
    // Ohne vorhandenes `skills/` im Repo entsteht der Ordner lokal — das Repo bleibt unberührt.
    if (repository && await exists(join(repository, "skills"))) return join(repository, "skills");
    return this.skillsDirectory;
  }

  private async assertNameFree(name: string): Promise<void> {
    for (const path of [this.physicalPath(name), ...this.linkTargets(name)]) {
      if (await exists(path)) {
        throw new AppError(409, "SKILLS_NAME_TAKEN", `Ein Skill mit dem Namen „${name}" existiert bereits.`);
      }
    }
  }

  async createSkill(input: SkillEditorCreateRequest): Promise<SkillEditorCreateResponse> {
    this.assertName(input.name);
    const key = jobKey("create", input.name, null);
    if (!this.pendingJob(key)) await this.assertNameFree(input.name);
    const payload = { name: input.name, description: input.description, ...(input.license ? { license: input.license } : {}) };
    return this.runJob(key, "create", payload, (onProgress) => this.mutations.ensureSkillCreated(input, onProgress));
  }

  async renameSkill(input: { name: string; newName: string }): Promise<SkillEditorCreateResponse> {
    this.assertName(input.name);
    this.assertName(input.newName);
    if (input.name === input.newName) throw new AppError(400, "SKILLS_SAME_NAME", "Der Name ist unverändert.");
    const key = jobKey("rename", input.name, input.newName);
    if (!this.pendingJob(key)) {
      await this.assertNameFree(input.newName);
      const linkPath = join(this.skillsDirectory, input.name);
      if (!await exists(linkPath)) throw new AppError(404, "SKILLS_NOT_FOUND", "Dieser Skill wurde nicht gefunden.");
    }
    return this.runJob(key, "rename", { name: input.name, newName: input.newName }, (onProgress) => this.mutations.ensureSkillRenamed(input, onProgress));
  }

  async deleteSkill(input: { name: string }): Promise<void> {
    this.assertName(input.name);
    const key = jobKey("delete", input.name, null);
    if (!this.pendingJob(key)) {
      const linkPath = join(this.skillsDirectory, input.name);
      if (!await exists(linkPath)) throw new AppError(404, "SKILLS_NOT_FOUND", "Dieser Skill wurde nicht gefunden.");
    }
    await this.runJob(key, "delete", { name: input.name }, (onProgress) => this.mutations.ensureSkillRemoved(input.name, onProgress));
  }

  // --- Recovery -------------------------------------------------------------

  /** Nimmt unterbrochene Skill-Operationen beim Start idempotent wieder auf. */
  async recover(): Promise<{ resumed: number; needsRecovery: number }> {
    let resumed = 0;
    let needsRecovery = 0;
    for (const job of this.jobs.unfinished()) {
      try {
        const onProgress = () => this.jobs.markProgress(job.key);
        if (job.operation === "create") {
          const payload = job.payload as unknown as SkillEditorCreateRequest;
          this.jobs.complete(job.key, await this.mutations.ensureSkillCreated(payload, onProgress));
        } else if (job.operation === "rename") {
          const payload = job.payload as { name: string; newName: string };
          this.jobs.complete(job.key, await this.mutations.ensureSkillRenamed(payload, onProgress));
        } else {
          const payload = job.payload as { name: string };
          await this.mutations.ensureSkillRemoved(payload.name, onProgress);
          this.jobs.complete(job.key, null);
        }
        resumed += 1;
      } catch (error) {
        needsRecovery += 1;
        this.jobs.settle(job.key, "needs-recovery", error instanceof Error ? error.message : "Unbekannter Fehler.");
      }
    }
    return { resumed, needsRecovery };
  }

  recoveryReport(): { unfinished: number } {
    return { unfinished: this.jobs.unfinished().length };
  }

  private pendingJob(key: string): boolean {
    const job = this.jobs.find(key);
    return Boolean(job && (job.state === "running" || job.state === "needs-recovery"));
  }

  private runJob<T>(key: string, operation: SkillEditorJobOperation, payload: Record<string, unknown>, work: (onProgress: () => void) => Promise<T>): Promise<T> {
    const pending = this.jobLocks.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const run = (async () => {
      this.jobs.start(key, operation, payload);
      try {
        const result = await work(() => this.jobs.markProgress(key));
        this.jobs.complete(key, result);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
        // Nur wenn bereits ein externer Schritt begonnen wurde, kann ein
        // Teilzustand zurückbleiben. Fachliche Ablehnungen davor sind final.
        const progress = this.jobs.find(key)?.progress ?? 0;
        this.jobs.settle(key, progress > 0 ? "needs-recovery" : "failed", message);
        throw error;
      }
    })();
    this.jobLocks.set(key, run);
    return run.finally(() => { this.jobLocks.delete(key); });
  }

  // --- Git ------------------------------------------------------------------
  //
  // Editieren und Veröffentlichen sind getrennte Fähigkeiten: Der Editor schreibt
  // nur Dateien. Committen läuft ausschließlich über eine explizite Pfad-Allowlist
  // und einen an die Vorschau gebundenen Intent; Push ist ein eigener Schritt.

  private gitRepository(): SkillGitRepository {
    if (!this.options.repositoryDirectory) {
      throw new AppError(400, "SKILLS_REPOSITORY_MISSING", "Es ist kein Skill-Repository konfiguriert.");
    }
    return new SkillGitRepository(this.options.repositoryDirectory);
  }

  async gitPreview(): Promise<SkillEditorGitPreviewResponse> {
    return this.gitRepository().preview();
  }

  async gitCommit(input: { intent: string }): Promise<SkillEditorGitResponse> {
    return this.gitRepository().commit(input.intent);
  }

  async gitPush(): Promise<SkillEditorGitResponse> {
    return this.gitRepository().push();
  }
}
