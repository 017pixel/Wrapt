import { useState } from "react";
import { ClockIcon } from "../../icons";
import type { HermesV2Resources } from "./resource-types";
import { cronRowMeta } from "./cron-format";
import { HermesV2CronForm, type CronFormMode } from "./HermesV2CronForm";
import {
  HermesV2CronDeleteConfirm,
  HermesV2CronRunConfirm,
} from "./HermesV2CronConfirms";
import { JobActions, JobFacts, TargetActions, actionErrorLine, targetActionViews } from "./cron-detail";
import { RunsList } from "./cron-rows";
import {
  HermesV2SettingsGroup,
  HermesV2SettingsPage,
  HermesV2SettingsRow,
  HermesV2SettingsSection,
} from "./hermes-v2-settings";
import "./hermes-v2-resources.css";
import "./hermes-v2-cron.css";

/**
 * Cron-Bereich als Verwaltungsseite: Jobs stehen als Liste in einer
 * Kartengruppe, der gewählte Job öffnet darunter seine belegten Details.
 * Nur die freigegebenen Felder sind bearbeitbar, native Zusatzfelder
 * bleiben lesbar und werden beim Edit nicht angetastet. Missing, error und
 * empty bleiben ehrlich getrennt; kein Autoretry.
 */
export function HermesV2CronArea({ resources }: { resources: HermesV2Resources }) {
  const list = resources.cron.list;
  const jobs = list.data?.jobs ?? [];
  const selectedId = resources.cron.selectedId;
  const detail = resources.cron.detail;
  const job = detail.data?.job ?? jobs.find((entry) => entry.id === selectedId) ?? null;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = jobs.filter((entry) => `${entry.name} ${entry.prompt}`.toLowerCase().includes(query.trim().toLowerCase())
    && (status === "all" || (status === "paused" ? entry.paused === true : entry.paused === false)));
  const [form, setForm] = useState<CronFormMode | null>(null);
  const [confirmKind, setConfirmKind] = useState<null | "run" | "delete">(null);

  return (
    <HermesV2SettingsPage
      title="Cron"
      area="cron"
      description="Automatisch ausgeführte Agentenläufe. Eine Aktion gilt erst nach nativer Quittung als bestätigt."
      actions={
        <>
          <button
            type="button"
            className="quiet-button"
            disabled={list.status === "loading" || !resources.available}
            onClick={() => void resources.refresh()}
          >
            Cron aktualisieren
          </button>
          <button
            type="button"
            className="quiet-button-primary"
            disabled={!resources.available}
            onClick={() => setForm({ mode: "create" })}
          >
            Neuen Cron-Job erstellen
          </button>
        </>
      }
    >
      {actionErrorLine(resources.actionError)}
      <HermesV2SettingsSection
        title="Jobs"
        icon={<ClockIcon />}
        toolbar={
          <>
            <input
              type="search"
              className="hermesv2-input"
              aria-label="Cron-Jobs suchen"
              placeholder="Cron-Jobs suchen…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="hermesv2-resource-filters" role="group" aria-label="Cron-Status">
              {[["all", "Alle"], ["active", "Aktiv"], ["paused", "Pausiert"]].map(([value, label]) => (
                <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value!)}>
                  {label}
                </button>
              ))}
            </div>
          </>
        }
      >
        <HermesV2SettingsGroup>
          {jobs.length > 0 && filtered.length === 0 ? (
            <HermesV2SettingsRow title="Keine passenden Cron-Jobs." />
          ) : null}
          {list.status === "idle" ? (
            <HermesV2SettingsRow title="Cron-Jobs noch nicht geladen." />
          ) : null}
          {list.status === "loading" ? (
            <HermesV2SettingsRow title="Cron-Jobs werden geladen…" />
          ) : null}
          {list.status === "missing" ? (
            <HermesV2SettingsRow title="Cron-Zuordnung fehlt nativ." />
          ) : null}
          {list.status === "error" && list.error ? (
            <HermesV2SettingsRow
              title="Cron-Liste nicht lesbar"
              status={list.error.message}
              control={
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => void resources.refresh()}
                >
                  Erneut laden
                </button>
              }
            />
          ) : null}
          {list.status === "ready" && list.data && jobs.length === 0 ? (
            <HermesV2SettingsRow title="Keine Cron-Jobs." />
          ) : null}
          {list.data?.truncated ? (
            <HermesV2SettingsRow title="Liste gekürzt" description="Es gibt nativ mehr Jobs." />
          ) : null}
          {list.stale ? (
            <HermesV2SettingsRow title="Angemeldete Liste ist veraltet." />
          ) : null}
          {filtered.map((entry) => (
            <HermesV2SettingsRow
              key={entry.id}
              selected={entry.id === selectedId}
              title={
                <button
                  type="button"
                  className="hermesv2-settings-row-link"
                  aria-label={`Cron-Job: ${entry.name || entry.id}`}
                  aria-current={entry.id === selectedId ? "true" : undefined}
                  data-hermes-cron-job={entry.id}
                  onClick={() => resources.selectCron(entry.id)}
                >
                  {entry.name || entry.id}
                </button>
              }
              description={entry.prompt}
              status={cronRowMeta(entry)}
            />
          ))}
        </HermesV2SettingsGroup>
      </HermesV2SettingsSection>
      <HermesV2SettingsSection
        title="Details"
        actions={
          job && selectedId !== null ? (
            <>
              <JobActions
                resources={resources}
                job={job}
                onEdit={() => setForm({ mode: "edit", jobId: selectedId })}
                onRun={() => setConfirmKind("run")}
                onDelete={() => setConfirmKind("delete")}
              />
              <button
                type="button"
                className="quiet-button"
                disabled={!resources.available}
                onClick={() => void resources.refreshCronDetail()}
              >
                Details neu lesen
              </button>
            </>
          ) : null
        }
      >
        {selectedId === null ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow title="Wähle einen Cron-Job aus." />
          </HermesV2SettingsGroup>
        ) : detail.status === "idle" ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow title="Details noch nicht geladen." />
          </HermesV2SettingsGroup>
        ) : detail.status === "loading" ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow title="Details werden geladen…" />
          </HermesV2SettingsGroup>
        ) : detail.data ? (
          <JobFacts job={detail.data.job} />
        ) : detail.status === "missing" ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow
              title="Dieser Job existiert nativ nicht mehr."
              description="Ein One-shot kann nach dem Lauf verschwunden sein; die Quittung einer Ausführung bleibt erhalten."
            />
          </HermesV2SettingsGroup>
        ) : detail.error ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow
              title="Details nicht lesbar"
              status={detail.error.message}
              control={
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => void resources.refreshCronDetail()}
                >
                  Details erneut lesen
                </button>
              }
            />
          </HermesV2SettingsGroup>
        ) : null}
      </HermesV2SettingsSection>
      <HermesV2SettingsSection
        title="Cron-Läufe"
        actions={
          <button
            type="button"
            className="quiet-button"
            disabled={!resources.available}
            onClick={() => void resources.refreshCronRuns()}
          >
            Läufe aktualisieren
          </button>
        }
      >
        <RunsList resources={resources} />
      </HermesV2SettingsSection>
      {targetActionViews(resources, selectedId).length > 0 ? (
        <HermesV2SettingsSection title="Aktionen">
          <TargetActions resources={resources} jobId={selectedId} />
        </HermesV2SettingsSection>
      ) : null}
      {form ? (
        <HermesV2CronForm
          resources={resources}
          target={form}
          initial={form.mode === "edit" ? job : null}
          open
          onClose={() => setForm(null)}
        />
      ) : null}
      {confirmKind === "run" && job ? (
        <HermesV2CronRunConfirm resources={resources} job={job} onClose={() => setConfirmKind(null)} />
      ) : null}
      {confirmKind === "delete" && job ? (
        <HermesV2CronDeleteConfirm resources={resources} job={job} onClose={() => setConfirmKind(null)} />
      ) : null}
    </HermesV2SettingsPage>
  );
}
