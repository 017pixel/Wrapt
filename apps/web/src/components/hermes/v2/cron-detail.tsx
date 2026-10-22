import type { HermesV2CronJob } from "@wrapt/contracts/hermes-v2";
import type { HermesV2Resources } from "./resource-types";
import {
  HermesV2SettingsGroup,
  HermesV2SettingsRow,
} from "./hermes-v2-settings";
import {
  executionLabel,
  repeatValue,
  stateLabel,
  timeText,
} from "./cron-format";
import "./hermes-v2-resources.css";
import "./hermes-v2-cron.css";

export function actionErrorLine(error: { message: string } | null) {
  if (!error) return null;
  return (
    <p className="hermesv2-resource-error" role="alert">
      {error.message}
    </p>
  );
}

function operationLabel(operation: string): string {
  switch (operation) {
    case "cron.create": return "Erstellen";
    case "cron.update": return "Änderung";
    case "cron.pause": return "Pausieren";
    case "cron.resume": return "Fortsetzen";
    case "cron.run": return "Ausführen";
    case "cron.delete": return "Löschen";
    default: return operation;
  }
}

function outcomePhrase(view: {
  status: string;
  reconciled: boolean;
  error: { message: string } | null;
}): string {
  if (view.status === "not_sent") return `nicht gesendet: ${view.error?.message ?? ""}`;
  if (view.status === "rejected") return `abgelehnt: ${view.error?.message ?? ""}`;
  return `unbekannt: ${view.error?.message ?? ""}`;
}

/** Zielgebundene Receipts: Aktionen des gewählten Jobs plus Create-Aktionen
    ohne bereits konkretes Ziel, unabhängig von der Auswahl. Unknown liest
    bewusst neu; es gibt keinen zusätzlichen Auto-Write. Offene Aktionen bleiben
    neben den letzten drei übrigen Quittungen in der Originalreihenfolge sichtbar. */
export function targetActionViews(resources: HermesV2Resources, jobId: string | null) {
  const views = resources.actions.filter((action) => {
    if (action.targetId === null) return action.operation === "cron.create";
    return jobId !== null && action.targetId === jobId;
  });
  const recentReceipts = views.filter((view) =>
    view.status !== "pending" && (view.status !== "unknown" || view.reconciled),
  ).slice(-3);
  return views.filter((view) =>
    view.status === "pending" || (view.status === "unknown" && !view.reconciled)
    || recentReceipts.includes(view),
  );
}

export function TargetActions({
  resources,
  jobId,
}: {
  resources: HermesV2Resources;
  jobId: string | null;
}) {
  const visibleViews = targetActionViews(resources, jobId);
  if (visibleViews.length === 0) return null;
  return (
    <ul className="hermesv2-target-actions" aria-label="Cron-Aktionen">
      {visibleViews.map((view) => (
        <li key={view.key}>
          <span>
            {operationLabel(view.operation)}
            {": "}
            {view.status === "pending"
              ? "läuft…"
              : view.status === "confirmed"
                ? "bestätigt mit nativer Quittung"
                : outcomePhrase(view)}
          </span>
          {view.status === "unknown" ? (
            <button
              type="button"
              className="quiet-button"
              onClick={() => void resources.reconcileAction(view.key)}
            >
              Bewusst neu lesen
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Kopfbereich des gewählten Jobs: alle zielgebundenen Aktionen stehen
 * sichtbar nebeneinander. Pause und Fortsetzen folgen dem nativen
 * Zielstatus; ein laufender Lauf sperrt die übrigen Aktionen.
 */
export function JobActions({
  resources,
  job,
  onEdit,
  onRun,
  onDelete,
}: {
  resources: HermesV2Resources;
  job: HermesV2CronJob;
  onEdit: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  const busy = resources.actions.some(
    (action) => action.targetId === job.id && action.status === "pending",
  );
  const disabled = busy || !resources.available;
  const displayName = job.name || job.id;
  return (
    <>
      <button
        type="button"
        className="quiet-button"
        disabled={disabled}
        aria-label={`Cron-Job ausführen: ${displayName}`}
        onClick={onRun}
      >
        Ausführen
      </button>
      <button
        type="button"
        className="quiet-button"
        disabled={disabled}
        aria-label={`Cron-Job bearbeiten: ${displayName}`}
        onClick={onEdit}
      >
        Bearbeiten
      </button>
      {job.paused === true && !busy ? (
        <button
          type="button"
          className="quiet-button"
          disabled={disabled}
          aria-label={`Cron-Job fortsetzen: ${displayName}`}
          onClick={() => void resources.resumeCron(job.id)}
        >
          Fortsetzen
        </button>
      ) : job.paused === false && !busy ? (
        <button
          type="button"
          className="quiet-button"
          disabled={disabled}
          aria-label={`Cron-Job pausieren: ${displayName}`}
          onClick={() => void resources.pauseCron(job.id)}
        >
          Pausieren
        </button>
      ) : null}
      <button
        type="button"
        className="quiet-button modal-danger"
        disabled={disabled}
        aria-label={`Cron-Job löschen: ${displayName}`}
        onClick={onDelete}
      >
        Löschen
      </button>
    </>
  );
}

/**
 * Faktzeilen des gewählten Jobs: nur belegte Werte, native Zusatzfelder
 * lesbar und beim Edit unangetastet. Fehlende Angaben bleiben ausdrücklich
 * unbestimmt statt geraten zu werden.
 */
export function JobFacts({ job }: { job: HermesV2CronJob }) {
  return (
    <HermesV2SettingsGroup>
      {!job.valid ? (
        <HermesV2SettingsRow
          title="Der Job gilt nativ nicht als vollständig"
          description="Angaben können teilweise sein."
        />
      ) : null}
      {job.truncated ? (
        <HermesV2SettingsRow
          title="Der Jobcontent ist nativ gekürzt"
          description="Es liegt kein vollständiger Beleg vor."
        />
      ) : null}
      {job.paused === null ? (
        <HermesV2SettingsRow
          title="Pausenzustand ist nativ unbekannt"
          description="Pause und Fortsetzen bleiben deshalb ausdrücklich deaktiviert."
        />
      ) : null}
      <HermesV2SettingsRow title="Kennung" status={job.id} />
      <HermesV2SettingsRow title="Schedule" status={job.schedule ?? "unbekannt"} />
      <HermesV2SettingsRow title="Wiederholung" status={repeatValue(job.repeat)} />
      <HermesV2SettingsRow title="Ausführungsart" status={executionLabel(job)} />
      <HermesV2SettingsRow title="Ausführungsstatus" status={stateLabel(job)} />
      <HermesV2SettingsRow title="Nächste Ausführung" status={timeText(job.nextRunAt)} />
      <HermesV2SettingsRow title="Letzte Ausführung" status={timeText(job.lastRunAt)} />
      <HermesV2SettingsRow title="Letzter Status" status={job.lastStatus ?? "unbekannt"} />
      <HermesV2SettingsRow
        title="Abgeschlossene Läufe"
        status={job.completedRuns === null ? "unbekannt" : String(job.completedRuns)}
      />
      <HermesV2SettingsRow title="Arbeitsverzeichnis" status={job.workdir ?? "unbekannt"} />
      {job.lastError ? (
        <HermesV2SettingsRow title="Letzter Fehler" status={job.lastError} />
      ) : null}
      <HermesV2SettingsRow title="Prompt">
        {job.prompt ? (
          <div className="hermesv2-resource-scroll" aria-label="Prompt des Jobs">
            {job.prompt}
          </div>
        ) : (
          <p className="hermesv2-resource-status">Kein Prompt gesetzt.</p>
        )}
        {job.execution.mode === "script" || job.execution.noAgent ? (
          <p className="hermesv2-resource-note" role="status">
            {executionLabel(job)}: eine Promptänderung garantiert keine Änderung der
            Skriptausführung.
          </p>
        ) : null}
      </HermesV2SettingsRow>
      {job.additional.length > 0 ? (
        <HermesV2SettingsRow title="Native Zusatzfelder">
          <ul className="hermesv2-target-actions">
            {job.additional.map((extra) => (
              <li key={extra.key}>
                <span>
                  {extra.key}: {extra.value}
                  {extra.truncated ? " (gekürzt)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </HermesV2SettingsRow>
      ) : null}
    </HermesV2SettingsGroup>
  );
}
