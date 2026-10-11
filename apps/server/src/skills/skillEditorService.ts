import type { Dirent } from "node:fs";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  skillEditorStatusResponseSchema,
  skillEditorTreeResponseSchema,
  type HermesSkillEditorCreateRequest,
  type SkillEditorCreateRequest,
  type SkillEditorCreateResponse,
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
import { SkillFileStore } from "./skillEditorFiles.js";
import { SkillMutations } from "./skillEditorMutations.js";
import { HermesMutations } from "./hermesSkillMutations.js";
import { assertHermesName, findHermesSkill, hermesLinkBaseFor, hermesNameTaken, listHermesSkills, listRuleEntries } from "./hermesSkills.js";
import { parseSkillFrontmatter } from "./skillEditorText.js";
import { AppError } from "../utils/errors.js";
import { canonicalRootCandidates, contained } from "../utils/pathRoots.js";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  /** Hermes-Skillquelle (hermes-skills/); ohne Angabe entfällt der Hermes-Teil. */
  hermesSkillsDirectory?: string | null;
  /** Globale Hermes-Regeln als Einzeldatei; ohne Angabe entfällt der Eintrag. */
  hermesAgentsPath?: string | null;
  autosaveDebounceMilliseconds: number;
  maxFileBytes: number;
  /** SQLite-Datei für das Recovery-Journal der Skill-Operationen. */
  jobDatabasePath: string;
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
  private readonly files: SkillFileStore;
  private readonly mutations: SkillMutations;
  private readonly hermes: HermesMutations | null;
  private readonly jobLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly options: SkillEditorOptions) {
    const hermesSkillsDirectory = options.hermesSkillsDirectory ?? null;
    this.allowedRoots = canonicalRootCandidates([
      options.rootDirectory,
      ...options.propagateDirectories,
      ...(options.repositoryDirectory ? [options.repositoryDirectory] : []),
      ...(hermesSkillsDirectory ? [hermesSkillsDirectory] : []),
    ]);
    this.jobs = new SkillEditorJobStore(options.jobDatabasePath);
    this.files = new SkillFileStore({
      rootDirectory: options.rootDirectory,
      hermesSkillsDirectory,
      hermesAgentsPath: options.hermesAgentsPath ?? null,
      allowedRoots: this.allowedRoots,
      maxFileBytes: options.maxFileBytes,
    });
    this.mutations = new SkillMutations({
      skillsDirectory: this.skillsDirectory,
      propagateDirectories: options.propagateDirectories,
      repositoryDirectory: options.repositoryDirectory,
      physicalBase: () => this.physicalBase(),
      physicalPath: (name) => this.physicalPath(name),
      assertAllowedTarget: (canonical) => this.assertAllowedTarget(canonical),
    });
    this.hermes = hermesSkillsDirectory
      ? new HermesMutations({
        hermesSkillsDirectory,
        linkBase: hermesLinkBaseFor(options.hermesAgentsPath ?? null),
        assertAllowedTarget: (canonical) => this.assertAllowedTarget(canonical),
      })
      : null;
  }

  close() { this.jobs.close(); }

  get skillsDirectory(): string {
    return join(this.options.rootDirectory, "skills");
  }

  // --- Pfadprüfung ----------------------------------------------------------

  private assertAllowedTarget(canonical: string): void {
    if (this.allowedRoots.some((root) => contained(root, canonical))) return;
    throw new AppError(403, "SKILLS_PATH_OUTSIDE_ROOT", "Der Verweis führt aus den erlaubten Skill-Ordnern heraus.");
  }

  // --- Baum -----------------------------------------------------------------

  async list(): Promise<SkillEditorTreeResponse> {
    const agentsFile = await this.files.fileEntry(join(this.options.rootDirectory, "AGENTS.md"));
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
      const details = await stat(path).catch(() => null);
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
        files: broken ? [] : await this.files.walk(path, 0),
      });
    }
    const hermesSkillsDirectory = this.options.hermesSkillsDirectory ?? null;
    return skillEditorTreeResponseSchema.parse({
      rootDirectory: this.options.rootDirectory,
      agentsFile,
      ruleEntries: await listRuleEntries({
        rootDirectory: this.options.rootDirectory,
        hermesAgentsPath: this.options.hermesAgentsPath ?? null,
        maxFileBytes: this.options.maxFileBytes,
      }),
      skills,
      hermesSkills: hermesSkillsDirectory ? await listHermesSkills(hermesSkillsDirectory, this.files) : [],
    });
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
  // Pfadbasiert für alle Gruppen (Harness-Skills, Hermes-Skills, Regeleinträge);
  // die Zugriffs- und Konfliktlogik liegt im SkillFileStore.

  async readFile(input: { path: string }): Promise<SkillEditorReadResponse> {
    return this.files.readFile(input);
  }

  async writeFile(input: { path: string; content: string; expectedRevision?: string | null | undefined; expectedModifiedAt?: string | null | undefined }): Promise<SkillEditorReadResponse> {
    return this.files.writeFile(input);
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

  // --- Hermes-Skills ----------------------------------------------------------
  // Quelle im Repo (hermes-skills/<kategorie>/<name>), Rückverweis am Hermes-Platz.

  private requireHermes(): HermesMutations {
    if (!this.hermes || !(this.options.hermesSkillsDirectory ?? null)) {
      throw new AppError(400, "SKILLS_HERMES_MISSING", "Es ist kein Hermes-Skillverzeichnis konfiguriert.");
    }
    return this.hermes;
  }

  async createHermesSkill(input: HermesSkillEditorCreateRequest): Promise<SkillEditorCreateResponse> {
    const mutations = this.requireHermes();
    const directory = this.options.hermesSkillsDirectory!;
    this.assertName(input.name);
    assertHermesName(input.category, "Kategorie");
    const key = jobKey("create-hermes", `${input.category}/${input.name}`, null);
    if (!this.pendingJob(key) && await hermesNameTaken(directory, input.name)) {
      throw new AppError(409, "SKILLS_NAME_TAKEN", `Ein Hermes-Skill mit dem Namen „${input.name}" existiert bereits.`);
    }
    const payload = { name: input.name, category: input.category, description: input.description, ...(input.license ? { license: input.license } : {}) };
    return this.runJob(key, "create-hermes", payload, (onProgress) => mutations.ensureHermesSkillCreated(input, onProgress));
  }

  async renameHermesSkill(input: { name: string; newName: string }): Promise<SkillEditorCreateResponse> {
    const mutations = this.requireHermes();
    const directory = this.options.hermesSkillsDirectory!;
    this.assertName(input.name);
    this.assertName(input.newName);
    if (input.name === input.newName) throw new AppError(400, "SKILLS_SAME_NAME", "Der Name ist unverändert.");
    const location = await findHermesSkill(directory, input.name);
    const key = jobKey("rename-hermes", `${location.category}/${input.name}`, input.newName);
    if (!this.pendingJob(key) && await hermesNameTaken(directory, input.newName)) {
      throw new AppError(409, "SKILLS_NAME_TAKEN", `Ein Hermes-Skill mit dem Namen „${input.newName}" existiert bereits.`);
    }
    const payload = { category: location.category, name: input.name, newName: input.newName };
    return this.runJob(key, "rename-hermes", payload, (onProgress) => mutations.ensureHermesSkillRenamed(payload, onProgress));
  }

  async deleteHermesSkill(input: { name: string }): Promise<void> {
    const mutations = this.requireHermes();
    const directory = this.options.hermesSkillsDirectory!;
    this.assertName(input.name);
    const location = await findHermesSkill(directory, input.name);
    const key = jobKey("delete-hermes", `${location.category}/${input.name}`, null);
    const payload = { category: location.category, name: input.name };
    await this.runJob(key, "delete-hermes", payload, (onProgress) => mutations.ensureHermesSkillRemoved(payload.category, payload.name, onProgress));
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
        } else if (job.operation === "create-hermes") {
          const payload = job.payload as unknown as HermesSkillEditorCreateRequest;
          this.jobs.complete(job.key, await this.requireHermes().ensureHermesSkillCreated(payload, onProgress));
        } else if (job.operation === "rename-hermes") {
          const payload = job.payload as { category: string; name: string; newName: string };
          this.jobs.complete(job.key, await this.requireHermes().ensureHermesSkillRenamed(payload, onProgress));
        } else if (job.operation === "delete-hermes") {
          const payload = job.payload as { category: string; name: string };
          await this.requireHermes().ensureHermesSkillRemoved(payload.category, payload.name, onProgress);
          this.jobs.complete(job.key, null);
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
