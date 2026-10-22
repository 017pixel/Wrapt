import { memo, useState } from "react";
import { HermesV2Reasoning } from "./HermesV2Reasoning";
import { HermesV2ToolCard } from "./HermesV2ToolCard";
import { groupDurationLabel, type ToolEntry } from "./tool-group";

function sameEntries(a: readonly ToolEntry[], b: readonly ToolEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index]!;
    return (
      entry.tool.id === other.tool.id &&
      entry.tool.status === other.tool.status &&
      entry.tool.output === other.tool.output &&
      entry.tool.durationMs === other.tool.durationMs &&
      entry.timestamp === other.timestamp
    );
  });
}

function sameReasoning(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((text, index) => text === b[index]);
}

/**
 * Die Zeit bis zur Antwort steht nur im Kopf einer Gruppe mit mehreren
 * Aufrufen. Bei einem einzelnen Aufruf aendert sie das Bild nicht - dort
 * bleibt die Bremse wirksam.
 */
function sameDuration(
  a: { entries: readonly ToolEntry[]; durationMs?: number | null },
  b: { entries: readonly ToolEntry[]; durationMs?: number | null },
): boolean {
  if (a.entries.length < 2 || b.entries.length < 2) return true;
  return (a.durationMs ?? null) === (b.durationMs ?? null);
}

/**
 * Einklappbarer Block über aufeinanderfolgenden Werkzeugaufrufe. Der Kopf
 * nennt die Zeit bis zur Antwort; ohne belegte Zeit bleibt die Summe der
 * Aufrufe. Aufgeklappt folgt eine Zeile je Aufruf.
 * Die Gedanken des Agenten stehen als erste Zeile in derselben Liste, weil
 * sie zur selben Arbeit gehören. Ein einzelner laufender Aufruf erscheint
 * ohne Kopf als Vorschau.
 */
function HermesV2ToolGroupView({
  entries,
  reasoning = [],
  durationMs = null,
}: {
  entries: readonly ToolEntry[];
  reasoning?: readonly string[];
  durationMs?: number | null;
}) {
  const gedanken = reasoning.filter((text) => text.trim().length > 0);
  const [open, setOpen] = useState(false);
  const gedankenBlock = gedanken.length ? (
    <HermesV2Reasoning text={gedanken.join("\n\n")} />
  ) : null;
  if (entries.length === 0) return gedankenBlock;
  const single = entries.length === 1 ? entries[0] : undefined;
  if (single && single.tool.status === "running") {
    return (
      <div className="hermesv2-tool-running" role="status">
        {gedankenBlock}
        <HermesV2ToolCard tool={single.tool} timestamp={single.timestamp} />
      </div>
    );
  }
  // Ein einzelner Aufruf braucht keinen Gruppenkopf: die Zeile steht direkt,
  // wie bei T3 Code. Der Kopf entsteht erst, wenn mehrere Aufrufe zusammen
  // eine Liste bilden.
  if (single) {
    return (
      <div className="hermesv2-tool-group is-single">
        {gedankenBlock}
        <HermesV2ToolCard tool={single.tool} timestamp={single.timestamp} />
      </div>
    );
  }
  return (
    <details
      className="hermesv2-tool-group"
      data-count={entries.length}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary onClick={() => setOpen(true)}>
        <span className="hermesv2-tool-group-title">
          {groupDurationLabel(entries, durationMs)}
        </span>
        <span className="hermesv2-tool-caret" aria-hidden="true">
          ›
        </span>
      </summary>
      {/* Der Inhalt der Gruppe entsteht erst beim Oeffnen. Sonst baute jedes
          Token alle Karten des Verlaufs neu auf. */}
      {open ? (
        <div className="hermesv2-tool-group-body">
          {gedankenBlock}
          {entries.map((entry) => (
            <HermesV2ToolCard
              key={entry.tool.id}
              tool={entry.tool}
              timestamp={entry.timestamp}
            />
          ))}
        </div>
      ) : null}
    </details>
  );
}

/**
 * Unveraenderte Gruppen werden nicht neu gebaut. Ohne diese Bremse wuerde
 * jedes Token alle Werkzeugkarten des Verlaufs neu aufbauen. Die Dauer bis
 * zur Antwort gehoert zum Vergleich: sie aendert sich, wenn die Antwort
 * eintrifft, auch ohne neue Werkzeugaufrufe.
 */
export const HermesV2ToolGroup = memo(
  HermesV2ToolGroupView,
  (a, b) =>
    sameEntries(a.entries, b.entries) &&
    sameReasoning(a.reasoning ?? [], b.reasoning ?? []) &&
    sameDuration(a, b),
);
