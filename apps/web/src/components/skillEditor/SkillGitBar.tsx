import { useEffect, useState } from "react";
import type { SkillEditorGitPreviewResponse, SkillEditorGitResponse, SkillEditorRepositoryStatus } from "@wrapt/contracts";
import { ConfirmDialog, ModalFrame } from "../ModalDialog";
import { CheckIcon, CopyIcon, GitBranchIcon, LoaderIcon, UploadIcon, WarningIcon } from "../icons";
import { writeClipboardText } from "../../lib/clipboard";

interface SkillGitBarProps {
  repository: SkillEditorRepositoryStatus | null;
  preview: SkillEditorGitPreviewResponse | null;
  result: SkillEditorGitResponse | null;
  busy: boolean;
  onPreview: () => void;
  onCommit: (intent: string) => void;
  onPush: () => void;
}

/**
 * Git-Aktionen des Skill-Editors: Commit läuft immer über eine Vorschau mit
 * explizit freigegebenen Pfaden, Push ist ein davon getrennter Schritt.
 */
export function SkillGitBar({ repository, preview, result, busy, onPreview, onCommit, onPush }: SkillGitBarProps) {
  const [awaitingPreview, setAwaitingPreview] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pushConfirming, setPushConfirming] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!awaitingPreview || !preview) return;
    setAwaitingPreview(false);
    setPreviewOpen(true);
  }, [awaitingPreview, preview]);

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
        className="quiet-button skill-git-action"
        disabled={busy || repository === null}
        onClick={() => { setAwaitingPreview(true); onPreview(); }}
      >
        {busy && awaitingPreview ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <CheckIcon className="h-3.5 w-3.5" />}
        Vorschau &amp; committen
      </button>
      <button
        type="button"
        className="quiet-button"
        disabled={busy || repository === null}
        onClick={() => setPushConfirming(true)}
      >
        <UploadIcon className="h-3.5 w-3.5" /> Pushen
      </button>

      {empty && !result ? <span className="skill-git-count">Nichts zu committen.</span> : null}

      {result ? (
        <div className={`skill-git-result ${result.pushed ? "is-ok" : result.committed ? "is-pending" : "is-bad"}`} role="status">
          <p>
            {result.pushed ? <CheckIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <WarningIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            <span>
              {result.pushed ? "Push abgeschlossen." : result.message ?? result.notice ?? "Keine Änderungen."}
            </span>
          </p>
          {result.committed && !result.pushed ? <p className="skill-git-changes">Der Commit liegt lokal vor. Push ist ein eigener Schritt.</p> : null}
          {result.paths.length > 0 ? <p className="skill-git-changes">Übernommen: {result.paths.join(", ")}</p> : null}
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

      <ModalFrame
        open={previewOpen && preview !== null}
        title="Änderungen committen"
        description="Nur die aufgeführten Pfade werden übernommen. Fremde Arbeitsbaumänderungen bleiben unverändert."
        className="skill-git-preview-dialog"
        onClose={() => setPreviewOpen(false)}
      >
        {(requestClose) => preview ? (
          <>
            <div className="modal-content skill-git-preview">
              {preview.paths.length === 0 ? (
                <p>{preview.notice ?? "Es gibt nichts zu committen."}</p>
              ) : (
                <ul className="m-0 list-none space-y-1 p-0 font-mono text-xs">
                  {preview.paths.map((path) => <li key={path}>{path}</li>)}
                </ul>
              )}
              {preview.newFiles.length > 0 ? <p className="skill-git-changes">Neu: {preview.newFiles.join(", ")}</p> : null}
              {preview.excludedPaths.length > 0 ? <p className="skill-git-changes">Nicht übernommen: {preview.excludedPaths.join(", ")}</p> : null}
              {preview.diff ? <pre className="restart-log max-h-64 overflow-auto">{preview.diff}</pre> : null}
              {preview.diffTruncated ? <p className="skill-git-changes">Der Diff ist zur Anzeige gekürzt.</p> : null}
              {preview.errorTail ? <pre className="restart-log max-h-40 overflow-auto">{preview.errorTail}</pre> : null}
              {preview.notice && preview.paths.length > 0 ? <p className="skill-git-changes">{preview.notice}</p> : null}
            </div>
            <div className="modal-actions">
              <button type="button" className="quiet-button" onClick={requestClose}>Abbrechen</button>
              <button
                type="button"
                className="quiet-button-primary"
                autoFocus
                disabled={busy || preview.paths.length === 0}
                onClick={() => { setPreviewOpen(false); onCommit(preview.intent); }}
              >
                {busy ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <CheckIcon className="h-3.5 w-3.5" />} Committen
              </button>
            </div>
          </>
        ) : null}
      </ModalFrame>

      <ConfirmDialog
        open={pushConfirming}
        title="Commits pushen"
        description="Vorhandene lokale Commits des Skill-Repositories werden ins Remote gepusht. Ein Push lässt sich nicht ohne Weiteres zurücknehmen."
        confirmLabel="Pushen"
        onConfirm={onPush}
        onClose={() => setPushConfirming(false)}
      />
    </div>
  );
}
