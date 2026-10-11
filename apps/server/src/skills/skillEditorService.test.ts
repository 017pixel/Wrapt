import { lstat, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseSkillFrontmatter,
  readmeWithRow,
  readmeWithoutRow,
  readmeWithRenamedRow,
  withFrontmatterName,
} from "./skillEditorService.js";
import { cleanupFixtures, fixture, readme, skillFile } from "./skillEditorTestFixture.js";

afterEach(cleanupFixtures);

describe("Frontmatter und README", () => {
  it("liest flache Frontmatter-Schlüssel und überspringt verschachtelte Werte", () => {
    const parsed = parseSkillFrontmatter("---\nname: alpha\ndescription: Ein Skill\nmetadata:\n  type: user\n---\n\n# alpha\n");
    // `metadata:` hat keinen eigenen Wert, `type:` ist eingerückt — beide bleiben außen vor.
    expect(parsed).toEqual({ name: "alpha", description: "Ein Skill" });
  });

  it("setzt einen eingerückten Blockwert fort", () => {
    const parsed = parseSkillFrontmatter("---\nname: convex\ndescription:\n  Erste Zeile\n  zweite Zeile\nmetadata:\n  type: user\n---\n");
    expect(parsed.description).toBe("Erste Zeile zweite Zeile");
    expect(parsed.type).toBeUndefined();
  });

  it("liefert nichts ohne Frontmatter-Block", () => {
    expect(parseSkillFrontmatter("# alpha\n")).toEqual({});
  });

  it("ersetzt den Frontmatter-Namen", () => {
    expect(withFrontmatterName(skillFile("alpha", "x"), "beta")).toContain("name: beta");
  });

  it("fügt eine Tabellenzeile hinter der letzten Zeile ein", () => {
    const next = readmeWithRow(readme, "beta", "Zweiter | Skill")!;
    expect(next).toContain("| beta | Zweiter \\| Skill |");
    expect(next.split("\n").at(-1)).toBe("Ende.");
  });

  it("meldet eine fehlende Tabelle", () => {
    expect(readmeWithRow("# skills\n\nOhne Tabelle.\n", "beta", "x")).toBeNull();
    expect(readmeWithoutRow(readme, "gamma")).toBeNull();
  });

  it("benennt eine Zeile um und entfernt sie", () => {
    expect(readmeWithRenamedRow(readme, "alpha", "beta")).toContain("| beta | Erster Skill |");
    expect(readmeWithoutRow(readme, "alpha")).not.toContain("alpha");
  });
});
describe("Baum", () => {
  it("listet die globalen Regeln und die Skills mit Beschreibung", async () => {
    const { service, root } = await fixture();
    const tree = await service.list();
    expect(tree.rootDirectory).toBe(root);
    expect(tree.agentsFile?.name).toBe("AGENTS.md");
    expect(tree.agentsFile?.editable).toBe(true);
    expect(tree.skills).toHaveLength(1);
    expect(tree.skills[0]).toMatchObject({ name: "alpha", description: "Erster Skill", symlink: true, broken: false });
    expect(tree.skills[0]?.files.map((file) => file.name)).toEqual(["SKILL.md"]);
  });

  it("zeigt Unterordner und markiert kaputte Verweise", async () => {
    const { service, root, repository } = await fixture();
    await mkdir(join(repository, "skills/alpha/references"), { recursive: true });
    await writeFile(join(repository, "skills/alpha/references/notiz.md"), "Hinweis\n", "utf8");
    await symlink(join(root, "gibt-es-nicht"), join(root, "skills/kaputt"), "dir");

    const tree = await service.list();
    const alpha = tree.skills.find((skill) => skill.name === "alpha")!;
    expect(alpha.files.map((file) => file.name)).toContain("notiz.md");
    const broken = tree.skills.find((skill) => skill.name === "kaputt")!;
    expect(broken.broken).toBe(true);
    expect(broken.files).toEqual([]);
  });

  it("kommt ohne skills-Ordner zurecht", async () => {
    const { service, root } = await fixture({ withRepository: false });
    await rm(join(root, "skills"), { recursive: true, force: true });
    await expect(service.list()).resolves.toMatchObject({ skills: [] });
  });
});

describe("Lesen und Schreiben", () => {
  it("liest den vollständigen Inhalt über den Symlink", async () => {
    const { service, root } = await fixture();
    const file = await service.readFile({ path: join(root, "skills/alpha/SKILL.md") });
    expect(file.content).toContain("name: alpha");
    expect(file.name).toBe("SKILL.md");
  });

  it("schreibt in die Repo-Datei hinter dem Verweis", async () => {
    const { service, root, repository } = await fixture();
    const path = join(root, "skills/alpha/SKILL.md");
    const before = await service.readFile({ path });
    expect(before.revisionToken).toMatch(/^[0-9a-f]{64}$/);
    const saved = await service.writeFile({ path, content: skillFile("alpha", "Neu beschrieben"), expectedRevision: before.revisionToken });
    expect(saved.content).toContain("Neu beschrieben");
    expect(saved.revisionToken).not.toBe(before.revisionToken);
    await expect(readFile(join(repository, "skills/alpha/SKILL.md"), "utf8")).resolves.toContain("Neu beschrieben");
  });

  it("lehnt einen Schreibvorgang auf eine fremd geänderte Datei ab", async () => {
    const { service, root, repository } = await fixture();
    const path = join(root, "skills/alpha/SKILL.md");
    const before = await service.readFile({ path });
    // Externe Änderung mit gleicher Größe und dichter Mtime: nur der Inhaltshash
    // unterscheidet sich — genau dieser Fall darf nicht still überschrieben werden.
    await writeFile(join(repository, "skills/alpha/SKILL.md"), skillFile("alpha", "Fremde Fassung"), "utf8");
    await expect(service.writeFile({ path, content: "x", expectedRevision: before.revisionToken }))
      .rejects.toMatchObject({ statusCode: 409, code: "SKILLS_CONFLICT" });
    await expect(service.writeFile({ path, content: "x", expectedModifiedAt: before.modifiedAt }))
      .rejects.toMatchObject({ statusCode: 409, code: "SKILLS_CONFLICT" });
    await expect(readFile(join(repository, "skills/alpha/SKILL.md"), "utf8")).resolves.toContain("Fremde Fassung");
  });

  it("lehnt Binärdateien und zu große Dateien ab", async () => {
    const { service, root, repository } = await fixture();
    await writeFile(join(repository, "skills/alpha/bild.bin"), Buffer.from([0xff, 0xfe, 0x00, 0x80]));
    await expect(service.readFile({ path: join(root, "skills/alpha/bild.bin") }))
      .rejects.toMatchObject({ statusCode: 415, code: "SKILLS_NOT_TEXT" });

    await writeFile(join(repository, "skills/alpha/gross.md"), "x".repeat(5_000), "utf8");
    await expect(service.readFile({ path: join(root, "skills/alpha/gross.md") }))
      .rejects.toMatchObject({ statusCode: 413, code: "SKILLS_FILE_TOO_LARGE" });
  });

  it("meldet kaputte Verweise beim Öffnen", async () => {
    const { service, root } = await fixture();
    await symlink(join(root, "fehlt.md"), join(root, "skills/alpha/tot.md"));
    await expect(service.readFile({ path: join(root, "skills/alpha/tot.md") }))
      .rejects.toMatchObject({ statusCode: 409, code: "SKILLS_SYMLINK_BROKEN" });
  });
});

describe("Containment", () => {
  it("weist Pfade außerhalb des Root-Ordners ab", async () => {
    const { service, base } = await fixture();
    for (const path of [join(base, "geheim.md"), "/etc/passwd", "../../etc/passwd"]) {
      await expect(service.readFile({ path })).rejects.toMatchObject({ code: "SKILLS_PATH_OUTSIDE_ROOT" });
    }
  });

  it("weist Verweise ab, die aus den erlaubten Bereichen führen", async () => {
    const { service, root, base } = await fixture();
    await writeFile(join(base, "aussen.md"), "geheim\n", "utf8");
    await symlink(join(base, "aussen.md"), join(root, "skills/alpha-flucht.md"));
    await expect(service.readFile({ path: join(root, "skills/alpha-flucht.md") }))
      .rejects.toMatchObject({ statusCode: 403, code: "SKILLS_PATH_OUTSIDE_ROOT" });
  });
});

describe("Skills anlegen, umbenennen und löschen", () => {
  it("legt Ordner, Scaffold, Symlinks und README-Zeile an", async () => {
    const { service, root, repository, claude, codex } = await fixture();
    const result = await service.createSkill({ name: "beta", description: "Zweiter Skill", license: "MIT" });

    expect(result.readmeUpdated).toBe(true);
    expect(result.propagated).toEqual([join(claude, "beta"), join(codex, "beta")]);
    const content = await readFile(join(repository, "skills/beta/SKILL.md"), "utf8");
    expect(content).toBe("---\nname: beta\ndescription: Zweiter Skill\nlicense: MIT\n---\n\n# beta\n");
    expect((await lstat(join(root, "skills/beta"))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(claude, "beta"))).isSymbolicLink()).toBe(true);
    await expect(readFile(join(repository, "README.md"), "utf8")).resolves.toContain("| beta | Zweiter Skill |");
    await expect(service.readFile({ path: result.path })).resolves.toMatchObject({ name: "SKILL.md" });
  });

  it("legt ohne Repository direkt im Root an", async () => {
    const { service, root, claude } = await fixture({ withRepository: false });
    const result = await service.createSkill({ name: "lokal", description: "Nur lokal" });
    expect(result.readmeUpdated).toBe(false);
    expect((await lstat(join(root, "skills/lokal"))).isDirectory()).toBe(true);
    expect((await lstat(join(claude, "lokal"))).isSymbolicLink()).toBe(true);
  });

  it("lehnt belegte Namen und ungültige Namen ab", async () => {
    const { service } = await fixture();
    await expect(service.createSkill({ name: "alpha", description: "x" })).rejects.toMatchObject({ statusCode: 409, code: "SKILLS_NAME_TAKEN" });
    await expect(service.createSkill({ name: "Gross Falsch", description: "x" })).rejects.toMatchObject({ statusCode: 400, code: "SKILLS_NAME_INVALID" });
  });

  it("benennt Ordner, Verweise, Frontmatter und README um", async () => {
    const { service, root, repository, claude, codex } = await fixture();
    const result = await service.renameSkill({ name: "alpha", newName: "gamma" });

    expect(result.name).toBe("gamma");
    await expect(readdir(join(repository, "skills"))).resolves.toEqual(["gamma"]);
    await expect(readdir(join(root, "skills"))).resolves.toEqual(["gamma"]);
    await expect(readdir(claude)).resolves.toEqual(["gamma"]);
    await expect(readdir(codex)).resolves.toEqual(["gamma"]);
    await expect(readFile(join(repository, "skills/gamma/SKILL.md"), "utf8")).resolves.toContain("name: gamma");
    await expect(readFile(join(repository, "README.md"), "utf8")).resolves.toContain("| gamma | Erster Skill |");
    await expect(service.readFile({ path: join(root, "skills/gamma/SKILL.md") })).resolves.toMatchObject({ name: "SKILL.md" });
  });

  it("löscht Ordner, Verweise und README-Zeile", async () => {
    const { service, root, repository, claude, codex } = await fixture();
    await service.deleteSkill({ name: "alpha" });

    await expect(readdir(join(repository, "skills"))).resolves.toEqual([]);
    await expect(readdir(join(root, "skills"))).resolves.toEqual([]);
    await expect(readdir(claude)).resolves.toEqual([]);
    await expect(readdir(codex)).resolves.toEqual([]);
    await expect(readFile(join(repository, "README.md"), "utf8")).resolves.not.toContain("alpha");
  });

  it("löscht einen kaputten Verweis, ohne das Ziel zu berühren", async () => {
    const { service, root, base } = await fixture();
    await symlink(join(base, "weg"), join(root, "skills/tot"), "dir");
    await service.deleteSkill({ name: "tot" });
    await expect(readdir(join(root, "skills"))).resolves.toEqual(["alpha"]);
  });

  it("meldet einen unbekannten Skill", async () => {
    const { service } = await fixture();
    await expect(service.deleteSkill({ name: "gibtsnicht" })).rejects.toMatchObject({ statusCode: 404, code: "SKILLS_NOT_FOUND" });
  });
});

describe("Hermes-Skills", () => {
  it("listet Regeleinträge und Hermes-Skills mit Kategorie", async () => {
    const { service, root, hermesAgents } = await fixture();
    const tree = await service.list();
    expect(tree.ruleEntries).toMatchObject([
      { id: "global", label: "AGENTS.md global", path: join(root, "AGENTS.md"), editable: true },
      { id: "hermes", label: "Hermes AGENTS.md", path: hermesAgents, editable: true },
    ]);
    expect(tree.ruleEntries[0]?.symlinkTarget).toBeNull();
    expect(tree.hermesSkills).toHaveLength(1);
    expect(tree.hermesSkills[0]).toMatchObject({
      name: "hermes-alpha",
      category: "devops",
      description: "Erster Hermes-Skill",
      symlink: false,
      broken: false,
    });
    expect(tree.hermesSkills[0]?.files.map((file) => file.name)).toEqual(["SKILL.md"]);
  });

  it("lässt den Hermes-Teil weg, wenn nichts konfiguriert ist", async () => {
    const { service } = await fixture({ withHermes: false });
    const tree = await service.list();
    expect(tree.ruleEntries.map((entry) => entry.id)).toEqual(["global"]);
    expect(tree.hermesSkills).toEqual([]);
  });

  it("liest und schreibt Hermes-Dateien über den Repo-Pfad", async () => {
    const { service, hermesSkills, repository } = await fixture();
    const path = join(hermesSkills, "devops/hermes-alpha/SKILL.md");
    const before = await service.readFile({ path });
    expect(before.content).toContain("Erster Hermes-Skill");
    const saved = await service.writeFile({ path, content: skillFile("hermes-alpha", "Neu beschrieben"), expectedRevision: before.revisionToken });
    expect(saved.content).toContain("Neu beschrieben");
    await expect(readFile(join(repository, "hermes-skills/devops/hermes-alpha/SKILL.md"), "utf8")).resolves.toContain("Neu beschrieben");
  });

  it("liest die Hermes-Regeldatei als Einzeldatei", async () => {
    const { service, hermesAgents } = await fixture();
    await expect(service.readFile({ path: hermesAgents })).resolves.toMatchObject({ name: "AGENTS.md" });
  });

  it("legt einen Hermes-Skill mit Rückverweis an", async () => {
    const { service, hermesSkills, hermesLinks } = await fixture();
    const result = await service.createHermesSkill({ name: "beta", category: "devops", description: "Zweiter Hermes-Skill", license: "MIT" });

    expect(result.readmeUpdated).toBe(false);
    expect(result.notice).toBeNull();
    expect(result.propagated).toEqual([join(hermesLinks, "devops/beta")]);
    const content = await readFile(join(hermesSkills, "devops/beta/SKILL.md"), "utf8");
    expect(content).toBe("---\nname: beta\ndescription: Zweiter Hermes-Skill\nlicense: MIT\n---\n\n# beta\n");
    // Quelle im Repo, Verweis am Hermes-Platz — dieselbe Richtung wie im Bestand.
    await expect(readlink(join(hermesLinks, "devops/beta"))).resolves.toBe(join(hermesSkills, "devops/beta"));
    await expect(service.readFile({ path: result.path })).resolves.toMatchObject({ name: "SKILL.md" });
  });

  it("lehnt belegte Namen und ungültige Kategorien ab", async () => {
    const { service } = await fixture();
    await expect(service.createHermesSkill({ name: "hermes-alpha", category: "software-development", description: "x" }))
      .rejects.toMatchObject({ statusCode: 409, code: "SKILLS_NAME_TAKEN" });
    await expect(service.createHermesSkill({ name: "neu", category: "Falsch!", description: "x" }))
      .rejects.toMatchObject({ statusCode: 400, code: "SKILLS_NAME_INVALID" });
  });

  it("benennt Ordner, Verweis und Frontmatter um", async () => {
    const { service, hermesSkills, hermesLinks } = await fixture();
    const result = await service.renameHermesSkill({ name: "hermes-alpha", newName: "gamma" });

    expect(result.name).toBe("gamma");
    await expect(readdir(join(hermesSkills, "devops"))).resolves.toEqual(["gamma"]);
    await expect(readdir(join(hermesLinks, "devops"))).resolves.toEqual(["gamma"]);
    await expect(readlink(join(hermesLinks, "devops/gamma"))).resolves.toBe(join(hermesSkills, "devops/gamma"));
    await expect(readFile(join(hermesSkills, "devops/gamma/SKILL.md"), "utf8")).resolves.toContain("name: gamma");
  });

  it("löscht Ordner und Rückverweis", async () => {
    const { service, hermesSkills, hermesLinks } = await fixture();
    await service.deleteHermesSkill({ name: "hermes-alpha" });

    await expect(readdir(join(hermesSkills, "devops"))).resolves.toEqual([]);
    await expect(readdir(join(hermesLinks, "devops"))).resolves.toEqual([]);
  });

  it("meldet unbekannte und mehrdeutige Hermes-Namen", async () => {
    const { service, hermesSkills } = await fixture();
    await expect(service.deleteHermesSkill({ name: "gibtsnicht" })).rejects.toMatchObject({ statusCode: 404, code: "SKILLS_NOT_FOUND" });
    await mkdir(join(hermesSkills, "software-development/hermes-alpha"), { recursive: true });
    await expect(service.deleteHermesSkill({ name: "hermes-alpha" })).rejects.toMatchObject({ statusCode: 409, code: "SKILLS_NAME_AMBIGUOUS" });
  });

  it("lehnt Hermes-Mutationen ohne Konfiguration ab", async () => {
    const { service } = await fixture({ withHermes: false });
    await expect(service.createHermesSkill({ name: "x", category: "devops", description: "x" }))
      .rejects.toMatchObject({ statusCode: 400, code: "SKILLS_HERMES_MISSING" });
  });
});
