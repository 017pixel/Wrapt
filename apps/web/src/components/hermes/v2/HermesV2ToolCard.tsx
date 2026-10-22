import type { ChatToolView } from "./chat-types";
import { HermesV2ToolDetails } from "./HermesV2ToolDetails";
import { formatClock, summarizeToolInput, toolStatusLabel } from "./tool-group";

/**
 * Eine Zeile je Werkzeugaufruf: Marker, Name, kurze Zusammenfassung des
 * Aufrufs, Status und Uhrzeit. Die Details (Eingabe/Ausgabe) öffnen die
 * Zeile selbst. Status und Ergebnis bleiben getrennt: „beendet" heißt nicht
 * erfolgreich, ein fehlender Fehler beweist keinen Erfolg.
 */
export function HermesV2ToolCard({
  tool,
  timestamp = null,
}: {
  tool: ChatToolView;
  timestamp?: number | null;
}) {
  const summary = summarizeToolInput(tool.input);
  const time = formatClock(timestamp);
  return (
    <details
      className="hermesv2-tool"
      data-state={tool.status}
      data-outcome={tool.outcome}
    >
      <summary>
        <span className="hermesv2-tool-marker" aria-hidden="true">
          &gt;
        </span>
        <span className="hermesv2-tool-name">{tool.name}</span>
        {summary ? (
          <span className="hermesv2-tool-summary">{summary}</span>
        ) : null}
        <span className="hermesv2-tool-state">{toolStatusLabel(tool)}</span>
        <span className="hermesv2-tool-caret" aria-hidden="true">
          ›
        </span>
        {time ? <time className="hermesv2-tool-time">{time}</time> : null}
      </summary>
      <div
        className="hermesv2-tool-body"
        role="region"
        aria-label={`Werkzeugdetails: ${tool.name}`}
        tabIndex={0}
      >
        <HermesV2ToolDetails tool={tool} />
        {tool.status === "complete" && tool.outcome === "unknown" ? (
          <p className="hermesv2-tool-note">
            Ergebnis unbekannt – es liegt kein Beleg für Erfolg oder Fehlschlag
            vor.
          </p>
        ) : null}
        {tool.status === "unknown" ? (
          <p className="hermesv2-tool-note">
            Verlauf dieses Aufrufs ist unbekannt.
          </p>
        ) : null}
      </div>
    </details>
  );
}
