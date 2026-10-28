import { HermesV2Toast } from "./HermesV2Toast";
// Aufgabenansicht: belegte Rosterzeilen, ehrliche Aktionsergebnisse, ein Queuekopf.
// Region über Button auf- und zuklappen; Inhalt per hidden entfernt, keine Kartenwand.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { ChatWorkSubagentView, ChatWorkView } from "./chat-work-types";
import type { HermesV2Chat } from "./chat-types";
import { coverageNote, displayName, resultLabel, truncate, uniqueLabels } from "./work-format";
import { WorkActionEntry, WorkDelegationRow, WorkProcessRow, WorkSubagentRow,
  WorkTaskRow, type WorkNote } from "./work-panel-rows";
import "./hermes-v2-work.css";

interface RowNotes {
  interrupt: WorkNote;
  tail: WorkNote;
  kill: WorkNote;
  tailText: { text: string; truncated: boolean } | null;
}

const baseNote: WorkNote = { busy: false, result: null };
const noNote: RowNotes = { interrupt: baseNote, tail: baseNote, kill: baseNote, tailText: null };

/** Neueste Aktion pro Ziel und Art gewinnt; pending läuft, unknown bleibt ehrlich unklar. */
function buildNotes(actions: ChatWorkView["actions"]): Map<string, RowNotes> {
  const notes = new Map<string, RowNotes>();
  for (const entry of actions) {
    if (!entry.targetId || !(entry.action.startsWith("subagent.") || entry.action === "process.kill")) continue;
    const id = `${entry.action}:${entry.targetId}`;
    const current = notes.get(id) ?? noNote;
    const result = entry.status === "confirmed" && entry.result
      ? resultLabel(entry.result)
      : entry.status === "unknown"
        ? entry.error?.message ?? "Der Ausgang dieser Aktion ist unklar."
        : entry.status === "not_sent"
          ? entry.error?.message ?? "Die Aktion wurde nicht gesendet."
          : null;
    const busy = entry.status === "pending";
    if (entry.action === "subagent.interrupt") {
      notes.set(id, { ...current, interrupt: { busy, result } });
    } else if (entry.action === "subagent.tail") {
      // Neuester Read gewinnt: confirmed ohne available entleert die frühere Ausgabekarte;
      // pending oder unknown zeigen keine Ausgabe als aktuelles Resultat.
      const tailText = entry.status === "confirmed" && entry.result
        && entry.result.kind === "subagent.tail" && entry.result.available
        ? { text: entry.result.text, truncated: entry.result.truncated }
        : null;
      notes.set(id, { ...current, tail: { busy, result }, tailText });
    } else {
      notes.set(id, { ...current, kill: { busy, result } });
    }
  }
  return notes;
}

/**
 * Die Zähler nennen die geladenen Zeilen, weil das die sind, die beim
 * Öffnen erscheinen. Die aktiven Zähler des Vertrags zählen nur laufende
 * Vorgänge und stünden als Nullen neben vorhandenen Zeilen.
 */
function countsLine(work: ChatWorkView): string | null {
  const parts = [
    work.subagents.length > 0 ? `Unteraufgaben ${work.subagents.length}` : null,
    work.processes.length > 0 ? `Prozesse ${work.processes.length}` : null,
    work.tasks.length > 0 ? `Nebenaufgaben ${work.tasks.length}` : null,
    work.delegations.length > 0 ? `Delegationen ${work.delegations.length}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(" · ") : null;
}

export interface HermesV2WorkPanelProps {
  chat: HermesV2Chat;
  /** Der native Kopf ist bereits im Verlauf sichtbar; die Region wiederholt ihn nicht. */
  queuedShown?: boolean;
  /** Sichtbare aktive Fläche: Wechsel entwertet offene lokale Region- und Zeilenzustände. */
  active?: boolean;
  /** Gleiche Fehlerursache wird bereits von der Chatfläche gemeldet. */
  errorVisible?: boolean;
}

/** Aufgabenansicht der aktiven Sitzung: Status, belegte Zeilen, Queuekopf, Aktionen. */
export function HermesV2WorkPanel({ chat, queuedShown = false, active = true, errorVisible = true }: HermesV2WorkPanelProps) {
  const work = chat.work;
  const [open, setOpen] = useState(false);
  const [openRows, setOpenRows] = useState<readonly string[]>([]);
  const regionId = `hermesv2-work-${useId()}`;
  const idBase = `hermesv2w-${useId()}`;
  const sessionId = chat.activeSnapshot?.sessionId ?? null;
  const generation = chat.activeSnapshot?.generation ?? 0;
  // Zeilendetails, Ausgaben und offene Ziele sind sitzungs- und generationsgebunden:
  // Wechsel, neuer Snapshot oder verdeckte Fläche entleeren sie. Die Offen-Präferenz
  // der Region selbst bleibt bewusst bestehen.
  useEffect(() => { setOpenRows([]); }, [sessionId, generation, active]);
  const notes = useMemo(() => buildNotes(work.actions), [work.actions]);
  const children = useMemo(() => {
    const map = new Map<string | null, ChatWorkSubagentView[]>();
    for (const row of work.subagents) {
      const list = map.get(row.parentKey) ?? [];
      list.push(row);
      map.set(row.parentKey, list);
    }
    return map;
  }, [work.subagents]);
  const labels = useMemo(() => ({
    subagents: uniqueLabels(work.subagents.map((row) => ({ id: row.id, label: displayName(row.goal, row.id) }))),
    processes: uniqueLabels(work.processes.map((row) => ({ id: row.id, label: displayName(row.command, row.id) }))),
  }), [work.subagents, work.processes]);

  const expand = (key: string) => setOpenRows((rows) =>
    rows.includes(key) ? rows.filter((row) => row !== key) : [...rows, key]);
  const rowNote = (action: "subagent.interrupt" | "subagent.tail" | "process.kill", id: string): WorkNote =>
    notes.get(`${action}:${id}`)?.[action === "process.kill" ? "kill" : action === "subagent.tail" ? "tail" : "interrupt"]
      ?? baseNote;
  const tailTextOf = (id: string) => notes.get(`subagent.tail:${id}`)?.tailText ?? null;

  // Der native Queuekopf steht im Verlauf; die Region zeigt ihn nur, wenn er dort fehlt.
  const queueLine = queuedShown ? null
    : !work.queue.observed ? "Nächste eingereihte Nachricht: unbekannt."
      : work.queue.head === null ? "Derzeit ist keine eingereihte Nachricht belegt."
        : truncate(work.queue.head, 160);
  const counts = countsLine(work);
  const coverage = coverageNote(work.coverage);
  const hasRows = work.subagents.length > 0 || work.delegations.length > 0
    || work.processes.length > 0 || work.tasks.length > 0;
  // Ein eigener Lesefehler bleibt sichtbar, auch ohne Aufgabenzeile.
  const errorNote = active && errorVisible && work.error ? (
    <HermesV2Toast key={`${sessionId}:${work.error.message}`} message={work.error.message}>
      <button type="button" className="quiet-button hermesv2-work-act" onClick={() => void chat.refreshWork()}>
        Erneut lesen
      </button>
    </HermesV2Toast>
  ) : null;
  // Ohne Aufgabenzeilen verschwindet die Ansicht ganz: kein Knopf, kein
  // Zähler, kein Platzhaltertext und kein leerer Bereich. Nur ein eigener
  // Lesefehler bleibt sichtbar.
  if (!hasRows) {
    return work.error ? (
      <section className="hermesv2-work">{errorNote}</section>
    ) : null;
  }

  const renderTree = (parentKey: string | null): ReactNode => {
    const rows = children.get(parentKey) ?? [];
    return rows.map((row) => (
      <WorkSubagentRow
        key={row.key}
        row={row}
        name={labels.subagents.get(row.id) ?? displayName(row.goal, row.id)}
        idBase={idBase}
        expanded={openRows.includes(row.key)}
        onExpand={expand}
        interrupt={rowNote("subagent.interrupt", row.id)}
        tail={rowNote("subagent.tail", row.id)}
        onInterrupt={() => void chat.interruptSubagent(row.id)}
        onTail={() => void chat.readSubagentTail(row.id)}
        tailText={tailTextOf(row.id)}
      >
        {renderTree(row.key)}
      </WorkSubagentRow>
    ));
  };

  return (
    <section className="hermesv2-work" data-open={open || undefined}>
      <div className="hermesv2-work-head">
        <button
          type="button"
          className="quiet-button hermesv2-work-toggle"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Aufgaben ausblenden" : "Aufgaben anzeigen"}
        </button>
        {counts ? <span className="hermesv2-work-counts">{counts}</span> : null}
        {open ? <button
          type="button"
          className="quiet-button hermesv2-work-refresh"
          aria-label="Aufgaben aktualisieren"
          disabled={!work.available || work.loading}
          onClick={() => void chat.refreshWork()}
        >
          Aktualisieren
        </button> : null}
      </div>
      <div id={regionId} hidden={!open} role="region" aria-label="Aufgabenansicht" className="hermesv2-work-region">
        {!work.available ? (
          <p className="hermesv2-work-note" role="status">
            Aufgaben sind in dieser Fläche derzeit nicht verfügbar.
          </p>
        ) : null}
        {work.loading ? <p className="hermesv2-work-note">Wird geladen…</p> : null}
        {coverage ? <p className="hermesv2-work-note">{coverage}</p> : null}
        {queueLine ? (
          <p className="hermesv2-work-queue" role="status" aria-label="Nächste eingereihte Nachricht">{queueLine}</p>
        ) : null}
        {work.subagents.length > 0 ? (
          <div className="hermesv2-work-section">
            <p className="hermesv2-work-heading">Unteraufgaben</p>
            {renderTree(null)}
          </div>
        ) : null}
        {work.processes.length > 0 ? (
          <div className="hermesv2-work-section">
            <p className="hermesv2-work-heading">Prozesse</p>
            {work.processes.map((row) => (
              <WorkProcessRow
                key={row.key}
                row={row}
                name={labels.processes.get(row.id) ?? displayName(row.command, row.id)}
                idBase={idBase}
                expanded={openRows.includes(row.key)}
                onExpand={expand}
                kill={rowNote("process.kill", row.id)}
                onKill={() => void chat.killProcess(row.id)}
              />
            ))}
          </div>
        ) : null}
        {work.delegations.length > 0 ? (
          <div className="hermesv2-work-section">
            <p className="hermesv2-work-heading">Fehlerdelegationen</p>
            {work.delegations.map((row) => <WorkDelegationRow key={row.key} row={row} />)}
          </div>
        ) : null}
        {work.tasks.length > 0 ? (
          <div className="hermesv2-work-section">
            <p className="hermesv2-work-heading">Nebenaufgaben</p>
            {work.tasks.map((row) => <WorkTaskRow key={row.key} row={row} />)}
          </div>
        ) : null}
        {work.actions.length > 0 ? (
          <div className="hermesv2-work-section">
            <p className="hermesv2-work-heading">Aufgabenaktionen</p>
            <div role="log" aria-label="Aufgabenaktionen">
              {work.actions.map((entry) => <WorkActionEntry key={entry.key} entry={entry} />)}
            </div>
          </div>
        ) : null}
      </div>
      {errorNote}
    </section>
  );
}
