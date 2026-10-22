import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { wraptQueries } from "../lib/queryOptions";
import { writeClipboardText } from "../lib/clipboard";
import {
  buildUpdateAgentPrompt,
  hasRemoteUpdate,
  updateStatusLabel,
  updateStatusTone,
} from "../lib/updateAgentPrompt";
import { Badge } from "./primitives";
import { CheckIcon, CopyIcon, DownloadIcon, LoaderIcon, RefreshIcon, WarningIcon } from "./icons";
import { ConfirmDialog } from "./ModalDialog";
import { RestartErrorDetails, RestartProgress, useSystemRestart } from "./SystemRestartControls";
import { QueryBoundary } from "./QueryBoundary";

export function SystemUpdateControls() {
  const statusQuery = useQuery(wraptQueries.updateStatus());
  const maintenance = useSystemRestart();
  const updating = maintenance.phase.status === "working";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptError, setPromptError] = useState("");
  const status = statusQuery.data;
  const remoteUpdate = hasRemoteUpdate(status);
  const prompt = status ? buildUpdateAgentPrompt(status) : "";

  async function refresh() {
    setError("");
    await statusQuery.refetch();
  }

  async function startUpdate() {
    if (updating) return;
    setError("");
    setConfirmOpen(false);
    await maintenance.update();
  }

  async function copyPrompt() {
    if (!prompt) return;
    setPromptError("");
    try {
      await writeClipboardText(prompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2_500);
    } catch {
      setPromptError("Kopieren wurde vom Browser nicht erlaubt. Prompt unten markieren und manuell kopieren.");
    }
  }

  const dirtyFiles = status?.dirtyFiles ?? [];
  const dirtyCount = status?.dirtyCount ?? dirtyFiles.length;
  const visibleFiles = dirtyFiles.slice(0, 5);
  const remainingFiles = Math.max(0, dirtyCount - visibleFiles.length);

  return (
    <div className="space-y-3">
      {statusQuery.isError ? <QueryBoundary isLoading={false} isError error={statusQuery.error} refetch={statusQuery.refetch}>{() => null}</QueryBoundary> : null}
      <div className="data-row px-0">
        <span className="text-muted">GitHub-Stand ({status?.branch ?? "…"})</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-text">
            {status ? `${status.localShort ?? "?"} → ${status.remoteShort ?? "?"}` : "—"}
          </span>
          <Badge tone={updateStatusTone(status)}>{updateStatusLabel(status)}</Badge>
        </span>
      </div>
      <div className="data-row px-0">
        <span className="text-muted">Version</span>
        <span className="font-mono text-text">{status?.version ?? "—"}</span>
      </div>
      <div className="data-row px-0">
        <span className="text-muted">Geprüft</span>
        <span className="font-mono text-text">
          {status?.checkedAt ? new Date(status.checkedAt).toLocaleString("de-DE") : "—"}
        </span>
      </div>
      <p className="text-[12px] text-faint" role="status">
        {statusQuery.isError ? "Der Update-Status konnte nicht aktualisiert werden." : statusQuery.isLoading ? "Prüfe GitHub Stand …" : (status?.message ?? "Noch nicht geprüft.")}
      </p>
      {status?.dirty ? (
        <div className="space-y-1" role="alert">
          <p className="flex items-start gap-2 text-[12px] text-bad">
            <WarningIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              {remoteUpdate
                ? `Lokale Änderungen (${dirtyCount}) blockieren das automatische Update. Nutze den KI-Prompt für den Abgleich.`
                : `Lokale Änderungen (${dirtyCount}) vorhanden. Sie bleiben erhalten, blockieren aber das automatische Update.`}
            </span>
          </p>
          {visibleFiles.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-6 font-mono text-[11px] text-muted">
              {visibleFiles.map((file) => (
                <li key={file} className="truncate">{file}</li>
              ))}
            </ul>
          ) : null}
          {remainingFiles > 0 ? (
            <p className="pl-6 text-[11px] text-faint">plus {remainingFiles} weitere Datei(en), siehe git status.</p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 text-[12px] text-bad" role="alert">
          <WarningIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {maintenance.phase.status !== "idle" ? <RestartProgress phase={maintenance.phase} /> : null}
      {maintenance.phase.status === "error" ? <RestartErrorDetails phase={maintenance.phase} /> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="quiet-button"
          disabled={statusQuery.isFetching || updating}
          onClick={() => void refresh()}
        >
          <RefreshIcon className="h-3.5 w-3.5" />
          {statusQuery.isFetching ? "Prüfe …" : "Nach Updates suchen"}
        </button>
        <button
          type="button"
          className="quiet-button-primary"
          disabled={!status?.updateAvailable || updating || statusQuery.isFetching || statusQuery.isError}
          onClick={() => setConfirmOpen(true)}
        >
          {updating ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <DownloadIcon className="h-3.5 w-3.5" />}
          Update installieren
        </button>
        <button
          type="button"
          className="quiet-button"
          disabled={!status || statusQuery.isLoading}
          onClick={() => void copyPrompt()}
        >
          {promptCopied
            ? <CheckIcon className="h-3.5 w-3.5" />
            : <CopyIcon className="h-3.5 w-3.5" />}
          {promptCopied ? "KI-Prompt kopiert" : "KI-Prompt kopieren"}
        </button>
      </div>
      {promptError ? (
        <p className="text-[12px] text-bad" role="alert">{promptError}</p>
      ) : null}
      <p className="text-[11px] text-faint">
        Holt origin/{status?.branch ?? "master"} per Fast-Forward, installiert, baut neu und startet den Dienst neu.
        Persönliche Plugins und lokale Konfiguration bleiben erhalten.
      </p>
      {prompt ? (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-muted">KI-Prompt ansehen</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-line bg-ink-900 p-3 font-mono text-[11px] leading-relaxed text-text">{prompt}</pre>
        </details>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="Update installieren?"
        description={`Wrapt wird auf ${status?.remoteShort ?? "den neuesten Stand"} aktualisiert, neu gebaut und neu gestartet. Geöffnete Panels und Terminals bleiben erhalten.`}
        confirmLabel={updating ? "Wird gestartet …" : "Update starten"}
        confirmPending={updating}
        error={error || null}
        onConfirm={() => void startUpdate()}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
