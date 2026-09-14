import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { SkillEditorService } from "./skillEditorService.js";

const cleanup: Array<() => Promise<unknown>> = [];

/** Räumt alle in diesem Testlauf erzeugten Fixtures auf. */
export async function cleanupFixtures(): Promise<void> {
  for (const remove of cleanup.splice(0).reverse()) await remove();
}

export const readme = [
  "# skills",
  "",
  "## Enthaltene Skills",
  "",
  "| Skill | Beschreibung |",
  "|-------|-------------|",
  "| alpha | Erster Skill |",
  "",
  "Ende.",
].join("\n");

export function skillFile(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

/** Baut das echte Setup nach: Repo mit Skills, Root mit Symlinks, zwei Verteilziele. */
export async function fixture(options: { withRepository?: boolean } = {}) {
  const base = await mkdtemp(join(tmpdir(), "workbench-skills-"));
  cleanup.push(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "opencode");
  const repository = join(base, "repo");
  const claude = join(base, "claude/skills");
  const codex = join(base, "codex/skills");
  const withRepository = options.withRepository !== false;

  await mkdir(join(root, "skills"), { recursive: true });
  await mkdir(claude, { recursive: true });
  await mkdir(codex, { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# Globale Regeln\n", "utf8");

  if (withRepository) {
    await mkdir(join(repository, "skills/alpha"), { recursive: true });
    await writeFile(join(repository, "README.md"), readme, "utf8");
    await writeFile(join(repository, "skills/alpha/SKILL.md"), skillFile("alpha", "Erster Skill"), "utf8");
    await symlink(join(repository, "skills/alpha"), join(root, "skills/alpha"), "dir");
    await symlink(join(root, "skills/alpha"), join(claude, "alpha"), "dir");
    await symlink(join(root, "skills/alpha"), join(codex, "alpha"), "dir");
  }

  const service = new SkillEditorService({
    rootDirectory: root,
    propagateDirectories: [claude, codex],
    repositoryDirectory: withRepository ? repository : null,
    autosaveDebounceMilliseconds: 2_500,
    maxFileBytes: 4_096,
    jobDatabasePath: join(base, "skill-jobs.sqlite"),
  });
  return { base, root, repository, claude, codex, service };
}

export async function initGitRepository(repository: string) {
  await execa("git", ["-C", repository, "init", "-b", "main"]);
  await execa("git", ["-C", repository, "config", "user.email", "test@example.com"]);
  await execa("git", ["-C", repository, "config", "user.name", "Test"]);
  await execa("git", ["-C", repository, "add", "-A"]);
  await execa("git", ["-C", repository, "commit", "-m", "init"]);
}
