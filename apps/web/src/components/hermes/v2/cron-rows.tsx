import type { HermesV2Resources } from "./resource-types";
import "./hermes-v2-resources.css";

/**
 * Runliste gehört exakt zum ausgewählten Job; Einmallauf-Folgen ehrlich.
 * Reiner Listkörper ohne eigene Doppelüberschrift — die Überschrift liefert
 * die umschließende RunsSection. Zeitwerte sind Epochmillisekunden.
 */
export function RunsList({ resources }: { resources: HermesV2Resources }) {
  const runs = resources.cron.runs;
  const list = runs.data?.runs ?? [];
  return (
    <>
      {runs.status === "idle" ? (
        <p className="hermesv2-resource-status" role="status">
          Läufe noch nicht geladen.
        </p>
      ) : null}
      {runs.status === "loading" ? (
        <p className="hermesv2-resource-status" role="status">
          Läufe werden geladen…
        </p>
      ) : null}
      {runs.data?.truncated ? (
        <p className="hermesv2-resource-status" role="status">
          Läuferückgabe ist gekürzt.
        </p>
      ) : null}
      {runs.status === "error" && runs.error ? (
        <p className="hermesv2-resource-error" role="alert">
          {runs.error.message}
        </p>
      ) : null}
      {runs.status === "missing" ? (
        <p className="hermesv2-resource-status" role="status">
          Läufe dieses Jobs fehlen nativ.
        </p>
      ) : null}
      {runs.status === "ready" && list.length === 0 ? (
        <p className="hermesv2-resource-status">Keine Läufe vorhanden.</p>
      ) : null}
      {list.length > 0 ? (
        <ul className="hermesv2-resource-rows hermesv2-runlist">
          {list.map((run, index) => (
            <li key={run.id ?? index} className="hermesv2-runrow">
              <p className="hermesv2-runrow-meta">
                {[
                  run.id ? `Lauf ${run.id}` : null,
                  run.startedAt !== null
                    ? new Date(run.startedAt).toLocaleString("de-DE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Start unbekannt",
                  run.status ? `Status ${run.status}` : "Status unbekannt",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {run.truncated ? " · Ausgabe gekürzt" : ""}
              </p>
              {run.text ? (
                <div
                  className="hermesv2-resource-scroll hermesv2-runrow-text"
                  aria-label={`Ausgabe: ${run.id ?? index}`}
                >
                  {run.text}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
