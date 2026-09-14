import { createHash } from "node:crypto";
import { execa } from "execa";
import type { SkillEditorGitChange, SkillEditorGitResponse } from "@wrapt/contracts";
import type { SkillEditorGitPreviewResponse } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

export const GIT_ERROR_TAIL_LINES = 40;
const GIT_TIMEOUT_MS = 120_000;
const MAXIMUM_DIFF_CHARACTERS = 200_000;
const MAXIMUM_STATUS_LINES = 5_000;

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Akten, die niemals in einen Skill-Commit gelangen (Fail-closed). */
export function secretLikePath(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return [
    /^\.env(\..*)?$/i,
    /\.(pem|key|p12|pfx|keystore)$/i,
    /^id_(rsa|ed25519|ecdsa)/,
    /^\.?(credentials?|secrets?)($|\.)/i,
    /^\.netrc$/,
    /^\.npmrc$/,
    /^\.git-credentials$/,
    /^\.htpasswd$/,
  ].some((pattern) => pattern.test(name));
}

function tail(value: string, lines = GIT_ERROR_TAIL_LINES): string {
  return value.trim().split("\n").slice(-lines).join("\n");
}

/**
 * Baut die Commit-Nachricht aus den geänderten Skills. Deutsch, imperativ und
 * ohne Emojis — bewusst rein regelbasiert, damit kein Modell nötig ist.
 */
export function buildCommitMessage(changes: SkillEditorGitChange[], globalRulesChanged: boolean): { title: string; body: string | null } {
  const added = changes.filter((change) => change.action === "hinzugefuegt").map((change) => change.name);
  const removed = changes.filter((change) => change.action === "entfernt").map((change) => change.name);
  const changed = changes.filter((change) => change.action === "geaendert").map((change) => change.name);
  const rulesMessage = "update: globale Agenten-Regeln aktualisiert";

  if (changes.length === 0) return { title: rulesMessage, body: null };

  let title: string;
  if (added.length > 0 && removed.length === 0 && changed.length === 0) {
    title = `feat: skill ${added.join(", ")} hinzugefuegt`;
  } else if (removed.length > 0 && added.length === 0 && changed.length === 0) {
    title = `chore: skill ${removed.join(", ")} entfernt`;
  } else if (changed.length > 0 && added.length === 0 && removed.length === 0) {
    title = `update: skills ${changed.join(", ")} aktualisiert`;
  } else {
    title = `update: skills ${changes.map((change) => change.name).join(", ")} aktualisiert`;
  }
  return { title, body: globalRulesChanged ? rulesMessage : null };
}

interface StatusRecord {
  code: string;
  path: string;
  originalPath: string | null;
}

/** Zerlegt `git status --porcelain -z` in einzelne Datensätze. */
export function parseStatusRecords(output: string): StatusRecord[] {
  const tokens = output.split("\0").filter((token) => token !== "");
  const records: StatusRecord[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const code = token.slice(0, 2);
    const path = token.slice(3);
    if (!path) continue;
    let originalPath: string | null = null;
    if (code.includes("R") || code.includes("C")) {
      originalPath = tokens[index + 1] ?? null;
      index += 1;
    }
    records.push({ code, path, originalPath });
  }
  return records;
}

/** Ordnet Statusdatensätze den sichtbaren Skills zu. */
export function summarizeChanges(records: StatusRecord[]): { changes: SkillEditorGitChange[]; globalRulesChanged: boolean } {
  const states = new Map<string, Set<string>>();
  let globalRulesChanged = false;
  for (const record of records) {
    const match = /^skills\/([^/]+)/.exec(record.path);
    if (!match) {
      if (record.path === "AGENTS.md" || record.path === "README.md") globalRulesChanged = true;
      continue;
    }
    const name = match[1]!;
    const bucket = states.get(name) ?? new Set<string>();
    bucket.add(record.code.trim());
    states.set(name, bucket);
  }
  const changes: SkillEditorGitChange[] = [...states.entries()]
    .map(([name, codes]) => {
      const all = [...codes];
      if (all.every((code) => code === "??" || code === "A")) return { name, action: "hinzugefuegt" as const };
      if (all.every((code) => code === "D")) return { name, action: "entfernt" as const };
      return { name, action: "geaendert" as const };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "de"));
  return { changes, globalRulesChanged };
}

function skillRoot(path: string): string | null {
  const match = /^(skills\/[^/]+)(\/|$)/.exec(path);
  if (!match) return null;
  return match[1]!;
}

function allowedRoot(record: StatusRecord): string | null {
  if (record.path === "README.md" || record.path === "AGENTS.md") return record.path;
  const root = skillRoot(record.path);
  if (!root) return null;
  const name = root.slice("skills/".length);
  return SKILL_NAME_PATTERN.test(name) ? root : null;
}

/**
 * Führt alle Git-Schritte des Skill-Editors ausschließlich über eine explizite
 * Pfad-Allowlist aus. Fremde Arbeitsbaumänderungen und Secrets bleiben
 * unangetastet; Push ist eine eigene, auditierbare Operation.
 */
export class SkillGitRepository {
  constructor(private readonly repositoryDirectory: string) {}

  private run(args: string[]) {
    return execa("git", ["-C", this.repositoryDirectory, ...args], { reject: false, timeout: GIT_TIMEOUT_MS });
  }

  private async currentBranch(): Promise<string> {
    const branch = await this.run(["branch", "--show-current"]);
    return branch.exitCode === 0 ? branch.stdout.trim() : "";
  }

  async preview(): Promise<SkillEditorGitPreviewResponse> {
    const [branch, statusResult] = await Promise.all([
      this.currentBranch(),
      this.run(["status", "--porcelain=v1", "-z", "-uall"]),
    ]);
    if (statusResult.exitCode !== 0) {
      return {
        branch, changes: [], paths: [], newFiles: [], excludedPaths: [], globalRulesChanged: false,
        diff: "", diffTruncated: false, intent: "", errorTail: tail(`${statusResult.stdout}\n${statusResult.stderr}`),
        notice: "Der Ordner ist kein lesbares Git-Repository.",
      };
    }
    const records = parseStatusRecords(statusResult.stdout);
    if (records.length > MAXIMUM_STATUS_LINES) {
      return {
        branch, changes: [], paths: [], newFiles: [], excludedPaths: [], globalRulesChanged: false,
        diff: "", diffTruncated: false, intent: "",
        errorTail: null, notice: "Zu viele Änderungen im Arbeitsbaum. Bitte zuerst extern aufräumen.",
      };
    }

    const roots = new Set<string>();
    const blockedRoots = new Set<string>();
    const excluded = new Set<string>();
    for (const record of records) {
      const root = allowedRoot(record);
      const originalRoot = record.originalPath ? allowedRoot({ ...record, path: record.originalPath }) : null;
      if (!root) { excluded.add(record.path); continue; }
      if (blockedRoots.has(root)) { excluded.add(root); continue; }
      if (secretLikePath(record.path) || (record.originalPath && secretLikePath(record.originalPath))) {
        // Ein Secret in einem Skill sperrt den gesamten Skill-Commit: Teil-
        // Commits würden einen inkonsistenten Skill-Stand veröffentlichen.
        blockedRoots.add(root);
        if (originalRoot) blockedRoots.add(originalRoot);
        roots.delete(root);
        if (originalRoot) roots.delete(originalRoot);
        excluded.add(root);
        continue;
      }
      roots.add(root);
      if (originalRoot) roots.add(originalRoot);
    }
    if (blockedRoots.size > 0) {
      // Fail-closed: Solange ein Secret in einem Skill liegt, wird überhaupt
      // nichts committet. Ein Teil-Commit würde README und Skill-Stand
      // auseinanderlaufen lassen.
      roots.clear();
    }
    const paths = [...roots].sort();
    const allowedRecords = records.filter((record) => {
      const root = allowedRoot(record);
      return Boolean(root && roots.has(root));
    });
    const { changes, globalRulesChanged } = summarizeChanges(allowedRecords);
    const newFiles = allowedRecords
      .filter((record) => record.code.includes("?") || record.code.includes("A"))
      .map((record) => record.path)
      .sort();

    let diff = "";
    let diffTruncated = false;
    if (paths.length > 0) {
      const diffResult = await this.run(["diff", "HEAD", "--", ...paths]);
      diff = diffResult.stdout;
      if (diff.length > MAXIMUM_DIFF_CHARACTERS) {
        diff = `${diff.slice(0, MAXIMUM_DIFF_CHARACTERS)}\n… Diff aus Größen- und Übersichtsgründen gekürzt.`;
        diffTruncated = true;
      }
    }
    // Noch nicht verfolgte Dateien erscheinen nicht in `git diff`. Ihre
    // Inhaltshashes gehören in den Intent, sonst könnte eine Änderung nach der
    // Vorschau unbemerkt committet werden.
    let newFileHashes: string[] = [];
    const untrackedFiles = allowedRecords.filter((record) => record.code.includes("?")).map((record) => record.path).sort();
    if (untrackedFiles.length > 0) {
      const hashResult = await this.run(["hash-object", "--", ...untrackedFiles]);
      if (hashResult.exitCode === 0) newFileHashes = hashResult.stdout.split("\n").filter((line) => line !== "");
    }
    const intent = createHash("sha256").update(JSON.stringify({
      branch,
      paths,
      records: records.map((record) => [record.code, record.path, record.originalPath]),
      diff,
      newFileHashes,
    })).digest("hex");

    const excludedPaths = [...excluded].sort().slice(0, 50);
    const notices: string[] = [];
    if (paths.length === 0) {
      notices.push(records.length === 0 ? "Es gibt nichts zu committen." : "Es gibt keine freigegebenen Skill-Änderungen zu committen.");
    }
    if (excludedPaths.length > 0) notices.push(`Nicht übernommen: ${excludedPaths.join(", ")}.`);
    return {
      branch, changes, paths, newFiles, excludedPaths, globalRulesChanged,
      diff, diffTruncated, intent, errorTail: null,
      notice: notices.length > 0 ? notices.join(" ") : null,
    };
  }

  async commit(intent: string): Promise<SkillEditorGitResponse> {
    const preview = await this.preview();
    if (preview.paths.length === 0) {
      return { committed: false, pushed: false, message: null, changedSkills: [], paths: [], errorTail: preview.errorTail, notice: preview.notice ?? "Es gibt nichts zu committen." };
    }
    if (preview.intent !== intent) {
      throw new AppError(409, "SKILLS_GIT_STALE", "Der Arbeitsstand hat sich seit der Vorschau geändert. Bitte die Vorschau neu laden und erneut bestätigen.");
    }
    if (!preview.branch) {
      throw new AppError(409, "SKILLS_GIT_DETACHED", "Das Skill-Repository hat keinen aktiven Branch (detached HEAD).");
    }
    const add = await this.run(["add", "--", ...preview.paths]);
    if (add.exitCode !== 0) {
      return { committed: false, pushed: false, message: null, changedSkills: preview.changes, paths: preview.paths, errorTail: tail(`${add.stdout}\n${add.stderr}`), notice: "Die Änderungen konnten nicht vorgemerkt werden." };
    }
    const { title, body } = buildCommitMessage(preview.changes, preview.globalRulesChanged);
    // `--only` schützt bereits vorgemerkte fremde Änderungen davor, in den
    // Commit zu rutschen: committet werden nur die explizit genannten Pfade.
    const commit = await this.run(["commit", "--only", "-m", title, ...(body ? ["-m", body] : []), "--", ...preview.paths]);
    if (commit.exitCode !== 0) {
      return { committed: false, pushed: false, message: null, changedSkills: preview.changes, paths: preview.paths, errorTail: tail(`${commit.stdout}\n${commit.stderr}`), notice: "Der Commit ist fehlgeschlagen." };
    }
    return { committed: true, pushed: false, message: title, changedSkills: preview.changes, paths: preview.paths, errorTail: null, notice: null };
  }

  async push(): Promise<SkillEditorGitResponse> {
    const push = await this.run(["push"]);
    if (push.exitCode !== 0) {
      return {
        committed: false, pushed: false, message: null, changedSkills: [], paths: [],
        errorTail: tail(`${push.stdout}\n${push.stderr}`),
        notice: "Das Pushen ist fehlgeschlagen. Der lokale Commit bleibt erhalten.",
      };
    }
    return { committed: false, pushed: true, message: null, changedSkills: [], paths: [], errorTail: null, notice: null };
  }
}
