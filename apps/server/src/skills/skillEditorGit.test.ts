import { chmod, lstat, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { execa } from "execa";
import { AppError } from "../utils/errors.js";
import { buildCommitMessage, parseStatusRecords, summarizeChanges } from "./skillGitRepository.js";
import { cleanupFixtures, fixture, initGitRepository, skillFile } from "./skillEditorTestFixture.js";

afterEach(cleanupFixtures);

describe("Commit-Nachrichten", () => {
  it("erkennt neue, geänderte und entfernte Skills", () => {
    const records = parseStatusRecords([
      "?? skills/neu/SKILL.md",
      " M skills/alpha/SKILL.md",
      " D skills/weg/SKILL.md",
      " M README.md",
    ].join("\0") + "\0");
    const { changes, globalRulesChanged } = summarizeChanges(records);
    expect(changes).toEqual([
      { name: "alpha", action: "geaendert" },
      { name: "neu", action: "hinzugefuegt" },
      { name: "weg", action: "entfernt" },
    ]);
    expect(globalRulesChanged).toBe(true);
  });

  it("wertet Umbenennungen über das Ziel aus", () => {
    const records = parseStatusRecords("R  skills/neu/SKILL.md\0skills/alt/SKILL.md\0");
    expect(summarizeChanges(records).changes).toEqual([{ name: "neu", action: "geaendert" }]);
  });

  it("formuliert je nach Art der Änderung", () => {
    expect(buildCommitMessage([{ name: "a", action: "hinzugefuegt" }, { name: "b", action: "hinzugefuegt" }], false).title).toBe("feat: skill a, b hinzugefuegt");
    expect(buildCommitMessage([{ name: "a", action: "entfernt" }], false).title).toBe("chore: skill a entfernt");
    expect(buildCommitMessage([{ name: "a", action: "geaendert" }], false).title).toBe("update: skills a aktualisiert");
    expect(buildCommitMessage([], true).title).toBe("update: globale Agenten-Regeln aktualisiert");
    expect(buildCommitMessage([{ name: "a", action: "geaendert" }], true).body).toBe("update: globale Agenten-Regeln aktualisiert");
  });
});

describe("Git", () => {
  it("meldet Branch und Anzahl der Änderungen", async () => {
    const { service, repository } = await fixture();
    await initGitRepository(repository);
    await service.createSkill({ name: "beta", description: "Zweiter Skill" });

    const status = await service.status();
    expect(status.repositoryConfigured).toBe(true);
    expect(status.repository?.branch).toBe("main");
    expect(status.repository?.dirtyCount).toBeGreaterThan(0);
  });

  it("committet nur freigegebene Skill-Pfade und pusht getrennt", async () => {
    const { service, repository } = await fixture();
    await writeFile(join(repository, "notes.txt"), "vorher", "utf8");
    await initGitRepository(repository);
    await writeFile(join(repository, "notes.txt"), "fremde Änderung", "utf8");
    await writeFile(join(repository, ".env"), "GEHEIM=1", "utf8");
    await service.createSkill({ name: "beta", description: "Zweiter Skill" });

    const preview = await service.gitPreview();
    expect(preview.paths).toEqual(["README.md", "skills/beta"]);
    expect(preview.newFiles).toContain("skills/beta/SKILL.md");
    expect(preview.excludedPaths).toContain("notes.txt");
    expect(preview.excludedPaths).toContain(".env");
    expect(preview.diffTruncated).toBe(false);

    const result = await service.gitCommit({ intent: preview.intent });
    expect(result).toMatchObject({ committed: true, pushed: false, message: "feat: skill beta hinzugefuegt", paths: ["README.md", "skills/beta"] });
    expect(result.changedSkills).toEqual([{ name: "beta", action: "hinzugefuegt" }]);

    const log = await execa("git", ["-C", repository, "log", "-1", "--pretty=%s"]);
    expect(log.stdout).toBe("feat: skill beta hinzugefuegt");
    const committedFiles = await execa("git", ["-C", repository, "show", "--name-only", "--pretty=format:"]);
    expect(committedFiles.stdout).not.toContain("notes.txt");
    expect(committedFiles.stdout).not.toContain(".env");
    // Die fremde Änderung liegt unverändert im Arbeitsbaum.
    expect(await readFile(join(repository, "notes.txt"), "utf8")).toBe("fremde Änderung");

    const push = await service.gitPush();
    expect(push).toMatchObject({ pushed: false });
    expect(push.errorTail).toBeTruthy();
  });

  it("weist einen veralteten Bestätigungs-Intent zurück", async () => {
    const { service, repository } = await fixture();
    await initGitRepository(repository);
    await service.createSkill({ name: "beta", description: "Zweiter Skill" });
    const preview = await service.gitPreview();

    await writeFile(join(repository, "skills/beta/SKILL.md"), skillFile("beta", "Nach der Vorschau geändert"), "utf8");
    await expect(service.gitCommit({ intent: preview.intent })).rejects.toMatchObject({ statusCode: 409, code: "SKILLS_GIT_STALE" });

    const status = await execa("git", ["-C", repository, "status", "--porcelain"]);
    expect(status.stdout).toContain("skills/beta");
  });

  it("sperrt einen Skill mit Secret-Datei vollständig", async () => {
    const { service, repository } = await fixture();
    await initGitRepository(repository);
    await service.createSkill({ name: "beta", description: "Zweiter Skill" });
    await writeFile(join(repository, "skills/beta/.env.local"), "TOKEN=1", "utf8");

    const preview = await service.gitPreview();
    expect(preview.paths).toEqual([]);
    expect(preview.excludedPaths).toContain("skills/beta");
    const result = await service.gitCommit({ intent: preview.intent });
    expect(result).toMatchObject({ committed: false });
  });

  it("meldet einen sauberen Arbeitsstand", async () => {
    const { service, repository } = await fixture();
    await initGitRepository(repository);
    const preview = await service.gitPreview();
    expect(preview).toMatchObject({ paths: [], changes: [], notice: "Es gibt nichts zu committen." });
    await expect(service.gitCommit({ intent: preview.intent || "0".repeat(16) })).resolves.toMatchObject({ committed: false, notice: "Es gibt nichts zu committen." });
  });

  it("lehnt Git ohne konfiguriertes Repository ab", async () => {
    const { service } = await fixture({ withRepository: false });
    await expect(service.gitPreview()).rejects.toBeInstanceOf(AppError);
    await expect(service.status()).resolves.toMatchObject({ repositoryConfigured: false, repository: null });
  });
});

describe("Recovery", () => {
  it("nimmt eine abgebrochene Umbenennung wieder auf und stellt alle Verweise wieder her", async () => {
    const { service, root, repository, claude, codex } = await fixture();
    const rootSkills = join(root, "skills");
    await chmod(rootSkills, 0o500);
    try {
      await expect(service.renameSkill({ name: "alpha", newName: "beta" })).rejects.toBeInstanceOf(AppError);
    } finally {
      await chmod(rootSkills, 0o755);
    }
    expect(service.recoveryReport().unfinished).toBeGreaterThan(0);

    await expect(service.renameSkill({ name: "alpha", newName: "beta" })).resolves.toMatchObject({
      name: "beta",
      propagated: [join(claude, "beta"), join(codex, "beta")],
    });
    expect(service.recoveryReport().unfinished).toBe(0);

    await expect(readdir(join(repository, "skills"))).resolves.toEqual(["beta"]);
    await expect(readlink(join(rootSkills, "beta"))).resolves.toBe(join(repository, "skills", "beta"));
    await expect(readlink(join(codex, "beta"))).resolves.toBe(join(rootSkills, "beta"));
    await expect(lstat(join(rootSkills, "alpha"))).rejects.toThrow();
    await expect(readFile(join(repository, "skills", "beta", "SKILL.md"), "utf8")).resolves.toContain("name: beta");
    await expect(readFile(join(repository, "README.md"), "utf8")).resolves.toContain("| beta | Erster Skill |");
  });

  it("führt eine abgebrochene Löschung idempotent zu Ende", async () => {
    const { service, root } = await fixture();
    const rootSkills = join(root, "skills");
    await chmod(rootSkills, 0o500);
    try {
      await expect(service.deleteSkill({ name: "alpha" })).rejects.toBeInstanceOf(AppError);
    } finally {
      await chmod(rootSkills, 0o755);
    }
    expect(service.recoveryReport().unfinished).toBeGreaterThan(0);

    await service.deleteSkill({ name: "alpha" });
    expect(service.recoveryReport().unfinished).toBe(0);
    await expect(readdir(rootSkills)).resolves.toEqual([]);
  });

  it("setzt parallele identische Anfragen nur einmal um", async () => {
    const { service, repository } = await fixture();
    const [first, second] = await Promise.all([
      service.renameSkill({ name: "alpha", newName: "beta" }),
      service.renameSkill({ name: "alpha", newName: "beta" }),
    ]);
    expect(first).toEqual(second);
    await expect(readdir(join(repository, "skills"))).resolves.toEqual(["beta"]);
  });
});
