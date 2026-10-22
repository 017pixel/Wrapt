import type { ChatSessionView, HermesV2Selection } from "./chat-types";

interface HermesV2SessionContextProps {
  snapshot:
    | (Pick<ChatSessionView, "sessionId" | "session"> & {
        /** Beobachtete Modellauswahl der Sitzung; ohne Angabe bleibt das Feld leer. */
        selection?: Pick<HermesV2Selection, "model"> | null;
      })
    | null;
}

/** Ein belegter Wert im Original. Leer und fehlend sind dasselbe. */
function reported(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return value.trim() ? value : null;
}

export interface SessionContextField {
  label: string;
  value: string;
}

/**
 * Belegte Angaben der gewählten Sitzung. Was nicht gemeldet ist, wird nicht
 * angezeigt und nicht ersetzt: kein Platzhalter, keine Ableitung aus dem Pfad.
 */
export function sessionContextFields(
  snapshot: HermesV2SessionContextProps["snapshot"],
): SessionContextField[] {
  if (!snapshot) return [];
  // Eine fremde Projektion gehört nicht zur gewählten Sitzung.
  const session =
    snapshot.session?.id === snapshot.sessionId ? snapshot.session : null;
  const candidates: Array<[string, string | null]> = [
    ["Arbeitsverzeichnis", reported(session?.cwd)],
    ["Modell", reported(snapshot.selection?.model) ?? reported(session?.model)],
    ["Projekt", reported(session?.projectId)],
    ["Quelle", reported(session?.source)],
  ];
  return candidates
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([label, value]) => ({ label, value }));
}

/** Ausschließlich die belegten Angaben der aktuell gewählten Sitzung. */
export function HermesV2SessionContext({ snapshot }: HermesV2SessionContextProps) {
  const fields = sessionContextFields(snapshot);
  if (fields.length === 0) return null;
  return (
    <section className="hermesv2-session-context" aria-label="Sitzungskontext">
      <dl>
        {fields.map((field) => (
          <div
            className="hermesv2-context-field"
            key={field.label}
            role="group"
            aria-label={field.label}
            tabIndex={0}
            title={field.value}
          >
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
