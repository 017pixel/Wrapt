import { useState } from "react";
import type { SkillEditorGitResponse, SkillEditorRepositoryStatus } from "@wrapt/contracts";
import { CheckIcon, CopyIcon, GitBranchIcon, LoaderIcon, UploadIcon, WarningIcon } from "../icons";
import { writeClipboardText } from "../../lib/clipboard";

interface SkillGitBarProps {
  repository: SkillEditorRepositoryStatus | null;
  result: SkillEditorGitResponse | null;
  busy: boolean;
  onCommitAndPush: () => void;
}

/**
 * Git-Aktionen des Skill-Editors: ein Knopf committet die geprüften Pfade und
 * pusht sie danach ins Remote. Vorschau und Push laufen dabei automatisch ab.
 */
export function SkillGitBar({ repository, result, busy, onCommitAndPush }: SkillGitBarProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const empty = repository === null || repository.dirtyCount === 0;

  return (
    <div className="skill-git-bar">
      <div className="skill-git-summary">
        <GitBranchIcon className="h-3.5 w-3.5" aria-hidden />
        <span className="skill-git-branch">{repository?.branch ?? "unbekannt"}</span>
        <span className="skill-git-count">
          {repository === null ? "Status nicht lesbar"
            : repository.dirtyCount === 0 ? "keine offenen Änderungen"
              : `${repository.dirtyCount} offene Änderung${repository.dirtyCount === 1 ? "" : "en"}`}
        </span>
      </div>

      <button
        type="button"
        className="quiet-button-primary skill-git-action"
        disabled={busy || empty}
        onClick={onCommitAndPush}
      >
        {busy ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <UploadIcon className="h-3.5 w-3.5" />}
        Commiten und Pushen auf GitHub
      </button>

      {empty && !result ? <span className="skill-git-count">Nichts zu committen.</span> : null}

      {result ? (
        <div className={`skill-git-result ${result.pushed ? "is-ok" : result.committed ? "is-pending" : "is-bad"}`} role="status">
          <p>
            {result.pushed ? <CheckIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <WarningIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            <span>
              {result.pushed ? "Commit und Push abgeschlossen." : result.message ?? result.notice ?? "Keine Änderungen."}
            </span>
          </p>
          {result.committed && !result.pushed ? <p className="skill-git-changes">Der Commit liegt lokal vor, der Push ist fehlgeschlagen.</p> : null}
          {result.changedSkills.length > 0 ? (
            <p className="skill-git-changes">
              {result.changedSkills.map((change) => `${change.name} (${change.action})`).join(", ")}
            </p>
          ) : null}
          {result.notice && result.message ? <p className="skill-git-changes">{result.notice}</p> : null}
          {result.errorTail ? (
            <div className="skill-git-log">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="quiet-button" onClick={() => setLogOpen(!logOpen)}>
                  {logOpen ? "Log ausblenden" : "Log anzeigen"}
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => {
                    void writeClipboardText(result.errorTail ?? "").then(() => setCopied(true)).catch(() => setCopied(false));
                  }}
                >
                  <CopyIcon className="h-3.5 w-3.5" /> {copied ? "Kopiert" : "Log kopieren"}
                </button>
              </div>
              {logOpen ? <pre className="restart-log">{result.errorTail}</pre> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
