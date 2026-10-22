import { useId, useState } from "react";
import type { HermesV2Configuration, HermesV2ConfigurationUpdate } from "@wrapt/contracts/hermes-v2";
import { useHermesV2Configuration } from "./useHermesV2Configuration";
import {
  HermesV2SettingsGroup,
  HermesV2SettingsPage,
  HermesV2SettingsRow,
  HermesV2SettingsSection,
} from "./hermes-v2-settings";

type Changes = HermesV2ConfigurationUpdate["changes"];

interface Draft {
  timezone: string;
  maxTurns: string;
  compression: boolean | null;
}

function emptyDraft(data: HermesV2Configuration | null): Draft {
  return {
    timezone: data?.values.timezone ?? "",
    maxTurns: String(data?.values.maxTurns ?? ""),
    compression: data?.values.compressionEnabled ?? null,
  };
}

function draftChanges(draft: Draft, data: HermesV2Configuration): Changes {
  const changes: Changes = {};
  if (draft.timezone !== (data.values.timezone ?? "")) changes.timezone = draft.timezone;
  if (draft.maxTurns !== String(data.values.maxTurns ?? "") && draft.maxTurns !== "") {
    changes.maxTurns = Number(draft.maxTurns);
  }
  if (draft.compression !== null && draft.compression !== data.values.compressionEnabled) {
    changes.compressionEnabled = draft.compression;
  }
  return changes;
}

/**
 * Konfigurationsseite im Einstellungsstil: ein Kopf mit Neuladen und
 * Speichern, danach die Abschnitte „Profil“ (nur lesbar) und „Agent“
 * (bearbeitbar). Gesendet werden ausschließlich geänderte Felder zusammen
 * mit dem erwarteten Altstand; ein unklarer Ausgang blockiert weitere
 * Schreibvorgänge bis zum bewussten Neuladen.
 */
export function HermesV2ConfigurationArea({ active }: { active: boolean }) {
  const configuration = useHermesV2Configuration(active);
  const data = configuration.data;
  const signature = data ? JSON.stringify(data.values) : "";
  const [seen, setSeen] = useState(signature);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(data));
  // Ein neuer Serverstand setzt den Entwurf zurück, ohne die Seite neu zu mounten.
  if (seen !== signature) {
    setSeen(signature);
    setDraft(emptyDraft(data));
  }
  const changes = data ? draftChanges(draft, data) : {};
  const dirty = Object.keys(changes).length > 0;
  const locked = !active || configuration.busy || configuration.blocked;
  const maxTurnsId = useId();
  const timezoneId = useId();
  const compressionId = useId();

  return (
    <HermesV2SettingsPage
      title="Konfiguration"
      area="configuration"
      description="Profilgebundene Einstellungen des Agenten. Gesendet werden nur geänderte Felder."
      actions={
        <>
          <button
            type="button"
            className="quiet-button"
            disabled={!active || configuration.busy}
            onClick={() => void configuration.load()}
          >
            Konfiguration neu laden
          </button>
          <button
            type="button"
            className="quiet-button-primary"
            disabled={locked || !dirty || (draft.maxTurns === "" && data?.values.maxTurns != null)}
            onClick={() => void configuration.save(changes)}
          >
            Änderungen speichern
          </button>
        </>
      }
    >
      {configuration.error ? (
        <p className="hermesv2-resource-error" role="alert">
          {configuration.error}
        </p>
      ) : null}
      {!data && configuration.busy ? (
        <div className="hermesv2-config-skeleton" role="status" aria-label="Konfiguration wird geladen">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {configuration.saved ? (
        <p className="hermesv2-resource-status" role="status">
          Änderungen gespeichert.
        </p>
      ) : null}
      {data ? (
        <>
          <HermesV2SettingsSection title="Profil">
            <HermesV2SettingsGroup>
              <HermesV2SettingsRow title="Profil" description="Aktives Hermes-Profil dieser Sitzung." status={data.profile} />
              <HermesV2SettingsRow title="Standardmodell" description="Modell, das ohne eigene Auswahl verwendet wird." status={data.model || "Nicht festgelegt"} />
              <HermesV2SettingsRow title="Freigabemodus" description="Wie der Agent Aktionen freigeben lässt." status={data.approvalMode || "Nicht festgelegt"} />
            </HermesV2SettingsGroup>
          </HermesV2SettingsSection>
          <HermesV2SettingsSection title="Agent">
            <HermesV2SettingsGroup>
              <HermesV2SettingsRow
                title="Maximale Schritte"
                description="Obergrenze der Agentenschritte pro Turn. Leer lässt den Hermes-Standard gelten."
                htmlFor={maxTurnsId}
                control={
                  <input
                    id={maxTurnsId}
                    className="hermesv2-input"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    placeholder="Hermes-Standard"
                    disabled={locked}
                    value={draft.maxTurns}
                    onChange={(event) => setDraft((current) => ({ ...current, maxTurns: event.target.value }))}
                  />
                }
              />
              <HermesV2SettingsRow
                title="Zeitzone"
                description="Zeitzone für Zeitangaben der Agenten und Protokolle."
                htmlFor={timezoneId}
                control={
                  <>
                    <input
                      id={timezoneId}
                      className="hermesv2-input"
                      list={`${timezoneId}-options`}
                      placeholder="Systemstandard"
                      disabled={locked}
                      value={draft.timezone}
                      onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
                    />
                    <datalist id={`${timezoneId}-options`}>
                      <option value="Europe/Berlin" />
                      <option value="UTC" />
                      <option value="Europe/Vienna" />
                      <option value="Europe/Zurich" />
                    </datalist>
                  </>
                }
              />
              <HermesV2SettingsRow
                title="Kontext automatisch komprimieren"
                description="Kürzt den Verlauf, sobald die Kontextgrenze erreicht ist."
                htmlFor={compressionId}
                control={
                  <select
                    id={compressionId}
                    className="hermesv2-input"
                    disabled={locked}
                    value={draft.compression === null ? "default" : String(draft.compression)}
                    onChange={(event) => setDraft((current) => ({ ...current, compression: event.target.value === "true" }))}
                  >
                    <option value="default" disabled>Hermes-Standard</option>
                    <option value="true">Aktiviert</option>
                    <option value="false">Deaktiviert</option>
                  </select>
                }
              />
            </HermesV2SettingsGroup>
          </HermesV2SettingsSection>
        </>
      ) : null}
    </HermesV2SettingsPage>
  );
}
