import { Link } from "react-router";
import type { HermesV2Resources } from "./resource-types";
import {
  epochText,
  originLabel,
  subsystemLabel,
  textStatusNote,
} from "./knowledge-format";
import "./hermes-v2-resources.css";

/**
 * Pendings sind echte native Vorschläge: Herkunft, Aktion, Zeitpunkt und
 * Payloadbeleg mit vollständiger Kennzeichnung. Approve/Reject werden nativ
 * nicht unterstützt und bleiben deshalb ehrlich disabled mit Classiclink;
 * es gibt keine direkte Dateilöschung.
 */
export function HermesV2PendingList({ resources }: { resources: HermesV2Resources }) {
  const pending = resources.pending;
  const records = pending.data?.records ?? [];
  return (
    <section
      className="hermesv2-pending"
      aria-label="Ausstehende Schreibvorgänge"
      data-hermes-pending="pending"
    >
      <div className="hermesv2-resource-head">
        <h3 className="hermesv2-resource-subhead">Ausstehende Schreibvorgänge</h3>
        {pending.data?.coverage === "partial" ? (
          <span className="hermesv2-resource-status" role="status">
            Abdeckung ist anteilig; es kann nativ mehr geben.
          </span>
        ) : null}
        {pending.data?.truncated ? (
          <span className="hermesv2-resource-status" role="status">
            Records sind gekürzt.
          </span>
        ) : null}
      </div>
      {pending.data?.review.supported === false ? (
        <p className="hermesv2-resource-status" role="status">
          Native Freigabe ist in dieser Installation nicht unterstützt; der
          Classic-Einstieg bleibt zuständig:{" "}
          <Link to={pending.data.review.adminPath}>Hermes-Verwaltung öffnen</Link>
        </p>
      ) : null}
      {pending.status === "idle" ? (
        <p className="hermesv2-resource-status" role="status">
          Ausstehende Vorschläge noch nicht geladen.
        </p>
      ) : null}
      {pending.status === "loading" ? (
        <p className="hermesv2-resource-status" role="status">
          Ausstehende Vorschläge werden geladen…
        </p>
      ) : null}
      {pending.status === "error" && pending.error ? (
        <p className="hermesv2-resource-error" role="alert">
          {pending.error.message}
        </p>
      ) : null}
      {pending.status === "ready" && records.length === 0 ? (
        <p className="hermesv2-resource-status">Keine ausstehenden Vorschläge.</p>
      ) : null}
      {records.map((record) => {
        const payloadNote = textStatusNote(record.payload);
        const payloadNoteLine = payloadNote
          ?? (record.payload.truncated
            ? "Payload ist gekürzt und kein voller Beleg."
            : "Payload ungekürzt.");
        const matchedNote =
          record.matchedEntryComplete === false
            ? "Der Beleg der ergänzten alten Zeile ist unvollständig."
            : null;
        return (
          <article key={record.id} className="hermesv2-pending-item" data-hermes-pending-id={record.id}>
            <p className="hermesv2-pending-meta" role="status">
              {[
                `Vorschlag ${record.id}`,
                subsystemLabel(record.subsystem),
                record.action ? `Aktion ${record.action}` : "Aktion unbekannt",
                originLabel(record.origin),
                `Zeitpunkt ${epochText(record.createdAt)}`,
                record.status === "unknown" ? "Status nativ unbekannt" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {record.summary ? (
              <p className="hermesv2-pending-summary" aria-label={`Ausstehender Vorschlag: ${shortLine(record.summary)}`}>
                {record.summary}
              </p>
            ) : null}
            {payloadNoteLine ? (
              <p className="hermesv2-resource-status">{payloadNoteLine}</p>
            ) : null}
            {record.payload.text ? (
              <div className="hermesv2-resource-scroll" aria-label={`Payload: ${record.id}`}>
                {record.payload.text}
              </div>
            ) : null}
            {matchedNote ? (
              <p className="hermesv2-resource-status" role="status">
                {matchedNote}
              </p>
            ) : null}
            <div className="hermesv2-form-actions">
              <button
                type="button"
                className="quiet-button"
                disabled
                aria-disabled="true"
                title="Native Freigabe wird nicht unterstützt; Review läuft in der klassischen Verwaltung."
              >
                Freigeben: {shortLine(record.summary ?? record.id)}
              </button>
              <button
                type="button"
                className="quiet-button modal-danger"
                disabled
                aria-disabled="true"
                title="Native Ablehnung wird nicht unterstützt; Review läuft in der klassischen Verwaltung."
              >
                Ablehnen: {shortLine(record.summary ?? record.id)}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

/** Anzeigename für möglicherweise lange Zusammenfassungen stabil kürzen. */
function shortLine(value: string): string {
  return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}
