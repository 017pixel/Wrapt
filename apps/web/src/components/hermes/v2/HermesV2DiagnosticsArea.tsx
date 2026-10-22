import { Link } from "react-router";
import type { HermesV2Resources } from "./resource-types";
import { FactRow, TextBlock } from "./resource-text";
import "./hermes-v2-resources.css";

const CONNECTION_STATE: Record<string, string> = {
  connecting: "Verbindet…",
  online: "Verbunden",
  reconnecting: "Verbindung wird aufgebaut…",
  offline: "Nicht verbunden",
  incompatible: "Nicht kompatibel",
  unavailable: "Nicht verfügbar",
};

/**
 * Diagnose-Bereich: tatsächlicher V2-Verbindungszustand, schmaler
 * Dashboard- und Updatestatus und begrenzte, redigierte Logbelege. Kopieren
 * läuft nur ausdrücklich auf Klick; Fehler sind sichtbar, kein Autocopy und
 * keine Doctor-, Update- oder Serviceaktionen.
 */
export function HermesV2DiagnosticsArea({ resources }: { resources: HermesV2Resources }) {
  const diagnostics = resources.diagnostics;
  const copy = resources.copy;
  const data = diagnostics.data;
  return (
    <div className="hermesv2-resource" data-hermes-area="diagnostics">
      <div className="hermesv2-resource-head">
        <strong>Diagnose</strong>
        {diagnostics.data?.truncated ? (
          <span className="hermesv2-resource-status" role="status">
            Diagnosebelege sind gekürzt.
          </span>
        ) : null}
        <span className="hermesv2-resource-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={diagnostics.status === "loading" || !resources.available}
            onClick={() => void resources.refresh()}
          >
            Diagnose aktualisieren
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!diagnostics.data || copy.status === "pending"}
            onClick={() => void resources.copyDiagnostics()}
          >
            Diagnose kopieren
          </button>
        </span>
      </div>
      {copy.status === "copied" ? (
        <p className="hermesv2-resource-status" role="status">
          Diagnose ist in die Zwischenablage kopiert.
        </p>
      ) : null}
      {copy.status === "error" && copy.error ? (
        <p className="hermesv2-resource-error" role="alert">
          Zwischenablage fehlgeschlagen: {copy.error.message}
        </p>
      ) : null}
      {diagnostics.status === "idle" ? (
        <p className="hermesv2-resource-status" role="status">
          Diagnose noch nicht geladen.
        </p>
      ) : null}
      {diagnostics.status === "loading" ? (
        <p className="hermesv2-resource-status" role="status">
          Diagnose wird geladen…
        </p>
      ) : null}
      {diagnostics.status === "error" && diagnostics.error ? (
        <div className="hermesv2-resource-error" role="alert">
          <p>{diagnostics.error.message}</p>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void resources.refresh()}
          >
            Diagnose aktualisieren
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="hermesv2-diagnose">
          <section aria-label="Verbindung: Hermes-V2-Verbindung">
            <h3 className="hermesv2-resource-subhead">Hermes-V2-Verbindung</h3>
            <FactRow
              label="Verbindungsstatus"
              value={CONNECTION_STATE[data.connection.state] ?? data.connection.state}
            />
            <FactRow
              label="Zeitepoche"
              value={data.connection.epoch ?? "unbekannt"}
            />
            <FactRow
              label="Abonnements"
              value={String(data.connection.subscriptions)}
            />
            <FactRow
              label="Geschützte Laufzeit"
              value={data.connection.protectedRuntime ? "ja" : "nein"}
            />
          </section>
          <section aria-label="Dashboardstatus">
            <h3 className="hermesv2-resource-subhead">Dashboardstatus</h3>
            <FactRow
              label="Dashboard erreichbar"
              value={data.dashboard.reachable ? "ja" : "nein"}
            />
            <FactRow label="Version" value={data.dashboard.version ?? "unbekannt"} />
            <FactRow
              label="Gatewayzustand"
              value={data.dashboard.gatewayState ?? "unbekannt"}
            />
            {data.dashboard.error ? (
              <p className="hermesv2-resource-error" role="alert">
                {data.dashboard.error}
              </p>
            ) : null}
          </section>
          <section aria-label="Updatestatus">
            <h3 className="hermesv2-resource-subhead">Updatestatus</h3>
            <FactRow label="Phase" value={data.update.phase ?? "unbekannt"} />
            <FactRow
              label="Warte auf ausstehendes Update"
              value={data.update.pending === null ? "unbekannt" : data.update.pending ? "ja" : "nein"}
            />
            <FactRow label="Letztes Ergebnis" value={data.update.lastResult ?? "unbekannt"} />
            <FactRow
              label="Letzte Prüfung"
              value={data.update.lastCheckedAt ?? "unbekannt"}
            />
            <div>
              <h3 className="hermesv2-resource-subhead">Update-Log</h3>
              <TextBlock text={data.update.logTail} ariaLabel="Update-Log" />
            </div>
          </section>
          <section aria-label="Agentlog-Bestand">
            <h3 className="hermesv2-resource-subhead">Agentlog</h3>
            <p className="hermesv2-resource-status" role="status">
              Redigierter Ausschnitt, gekürzt.
            </p>
            <TextBlock text={data.logs} ariaLabel="Agentlog" />
          </section>
          <p className="hermesv2-resource-status">
            Tiefere Verwaltung, Doctor und Updates bleiben in der klassischen
            Fläche: <Link to={data.adminPath}>Hermes-Verwaltung öffnen</Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
