import type { HermesV2ResourceText } from "@wrapt/contracts/hermes-v2";
import "./hermes-v2-resources.css";

const TEXT_STATUS: Record<HermesV2ResourceText["status"], string> = {
  available: "",
  empty: "Inhalt ist leer.",
  missing: "Inhalt fehlt nativ.",
  unreadable: "Inhalt ist aktuell unlesbar.",
  unknown: "Inhalt ist nativ unbekannt.",
};

/** Reiner Text als Text: ohne HTML-Ausführung, in eigener Scrollfläche. */
export function TextBlock({
  text,
  ariaLabel,
}: {
  text: HermesV2ResourceText;
  ariaLabel: string;
}) {
  const note = TEXT_STATUS[text.status];
  return (
    <div className="hermesv2-textblock">
      {note || text.truncated ? (
        <p className="hermesv2-resource-status" role="status">
          {[
            note || null,
            text.truncated ? "Inhalt ist gekürzt und kein voller Beleg." : null,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      ) : null}
      {text.text !== null && text.text !== "" ? (
        <div className="hermesv2-resource-scroll" aria-label={ariaLabel}>
          {text.text}
        </div>
      ) : null}
    </div>
  );
}

/** Faktzeile mit Verbatimwert; fehlende Werte bleiben ausdrücklich unbestimmt. */
export function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="hermesv2-factrow">
      <span className="hermesv2-factrow-label">{label}</span>
      <span className="hermesv2-factrow-value">{value}</span>
    </div>
  );
}
