// Zeilen der Aufgabenansicht: Unteraufgaben, Prozesse, Fehlerdelegationen, Nebenaufgaben, Aktionen.
// Nur belegte Werte, fehlende bleiben unbestimmt; Status ist nie nur Farbe. Zeilenkörper-IDs
// kommen aus dem Panel-vorhandenen idBase, damit Route, Panel und Orbit nicht kollidieren.
import { type CSSProperties, type ReactNode } from "react";
import type { HermesV2WorkDelegation, HermesV2WorkProcess, HermesV2WorkTask } from "@wrapt/contracts/hermes-v2";
import type { ChatWorkActionView, ChatWorkSubagentView } from "./chat-work-types";
import { TextBlock } from "./HermesV2Markdown";
import { actionRows, formatDuration, formatStamp, formatUptime,
  processStateView, subagentStatusLabel, taskKindLabel, truncate } from "./work-format";

/** Unsichtbare Marker für Root-E2Es, jede echte Rosterzeile bekommt beide. */
export function workRowProps(kind: string, key: string) {
  return { "data-hermes-work-kind": kind, "data-hermes-work-key": key };
}

function safeRowId(idBase: string, key: string): string {
  return `${idBase}-b-${key.replace(/[^A-Za-z0-9_-]/g, "_").slice(-40)}`;
}

/** Ausgang einer Zeilenaktion: belegt läuft/busy oder konkretes, ehrliches Resultat. */
export interface WorkNote {
  busy: boolean;
  result: string | null;
}

const emptyNote: WorkNote = { busy: false, result: null };
export const noWorkNote = emptyNote;

function metaRow(items: (string | null)[]): string | null {
  const parts = items.filter((item): item is string => item !== null);
  return parts.length ? parts.join(" · ") : null;
}

export function WorkSubagentRow({
  row, name, idBase, expanded, onExpand, interrupt, tail, onInterrupt, onTail, tailText, children,
}: {
  row: ChatWorkSubagentView;
  name: string;
  idBase: string;
  expanded: boolean;
  onExpand: (key: string) => void;
  interrupt: WorkNote;
  tail: WorkNote;
  onInterrupt: () => void;
  onTail: () => void;
  tailText: { text: string; truncated: boolean } | null;
  children?: ReactNode;
}) {
  const bodyId = safeRowId(idBase, row.key);
  // Der Status ist als Text am Knopf erreichbar, nicht nur farblich am Streifen.
  const stateId = `${bodyId}-state`;
  const details = metaRow([
    row.model ? `Modell ${row.model}` : null,
    row.startedAt !== null ? `gestartet ${formatStamp(row.startedAt)}` : null,
    row.durationMs !== null ? `Dauer ${formatDuration(row.durationMs)}` : null,
    row.toolCount !== null ? `${row.toolCount} Werkzeugaufrufe` : null,
    row.lastTool ? `letztes Werkzeug ${truncate(row.lastTool, 40)}` : null,
    row.acceptingSteer !== null
      ? row.acceptingSteer ? "nimmt Steuerung an" : "lehnt Steuerung ab" : null,
  ]);
  return (
    <div
      className={`hermesv2-work-row is-sub${row.flat ? " is-flat" : ""}`}
      style={{ "--hermesv2-work-depth": row.treeDepth } as CSSProperties}
      {...workRowProps("subagent", row.key)}
    >
      <button
        type="button"
        className="hermesv2-work-summary"
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-describedby={stateId}
        aria-label={`Unteraufgabe aufklappen: ${name}`}
        onClick={() => onExpand(row.key)}
      >
        <span className="hermesv2-work-name">{name}</span>
        <span id={stateId} className="hermesv2-work-state" data-status={row.status ?? "unknown"}>
          {subagentStatusLabel(row.status)}
        </span>
      </button>
      <div id={bodyId} hidden={!expanded} className="hermesv2-work-body">
        {details ? <p className="hermesv2-work-detail">{details}</p> : null}
        {row.goal ? <p className="hermesv2-work-goal">{truncate(row.goal, 200)}</p> : null}
        <div className="hermesv2-work-actions">
          <button
            type="button"
            className="quiet-button hermesv2-work-act"
            disabled={interrupt.busy}
            onClick={onInterrupt}
          >
            Unteraufgabe unterbrechen: {name}
          </button>
          <button
            type="button"
            className="quiet-button hermesv2-work-act"
            disabled={tail.busy}
            onClick={onTail}
          >
            Unteraufgabe-Ausgabe lesen: {name}
          </button>
        </div>
        {interrupt.result ? <p className="hermesv2-work-note" role="status">{interrupt.result}</p> : null}
        {tail.result ? <p className="hermesv2-work-note" role="status">{tail.result}</p> : null}
        {tailText ? (
          <div
            className="hermesv2-work-body-output"
            role="group"
            aria-label={`Unteraufgabe-Ausgabe: ${name}`}
          >
            {tailText.truncated ? <p className="hermesv2-work-note">Die Ausgabe ist gekürzt.</p> : null}
            <TextBlock text={tailText.text} className="is-io" />
          </div>
        ) : null}
        {children ? <div className="hermesv2-work-children">{children}</div> : null}
      </div>
    </div>
  );
}

export function WorkProcessRow({
  row, name, idBase, expanded, onExpand, kill, onKill,
}: {
  row: HermesV2WorkProcess & { key: string };
  name: string;
  idBase: string;
  expanded: boolean;
  onExpand: (key: string) => void;
  kill: WorkNote;
  onKill: () => void;
}) {
  const bodyId = safeRowId(idBase, row.key);
  const stateId = `${bodyId}-state`;
  const state = processStateView(row.status, row.exitCode);
  const details = metaRow([
    row.startedAt !== null ? `gestartet ${formatStamp(row.startedAt)}` : null,
    row.uptimeSeconds !== null ? `Läuft seit ${formatUptime(row.uptimeSeconds)}` : null,
    row.exitCode !== null ? `Exit ${row.exitCode}` : null,
  ]);
  return (
    <div className="hermesv2-work-row is-process" {...workRowProps("process", row.key)}>
      <button
        type="button"
        className="hermesv2-work-summary"
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-describedby={stateId}
        aria-label={`Prozess Details: ${name}`}
        onClick={() => onExpand(row.key)}
      >
        <span className="hermesv2-work-name">{name}</span>
        <span id={stateId} className="hermesv2-work-state" data-status={state.state}>
          {state.label}
        </span>
      </button>
      <div id={bodyId} hidden={!expanded} className="hermesv2-work-body">
        {details ? <p className="hermesv2-work-detail">{details}</p> : null}
        {row.output.length > 0 ? (
          <div className="hermesv2-work-body-output" role="group" aria-label={`Prozessausgabe: ${name}`}>
            <TextBlock text={row.output} className="is-io" />
          </div>
        ) : null}
        <div className="hermesv2-work-actions">
          <button type="button" className="quiet-button hermesv2-work-act" disabled={kill.busy} onClick={onKill}>
            Prozess beenden: {name}
          </button>
        </div>
        {kill.result ? <p className="hermesv2-work-note" role="status">{kill.result}</p> : null}
      </div>
    </div>
  );
}

export function WorkDelegationRow({ row }: { row: HermesV2WorkDelegation & { key: string } }) {
  const name = truncate((row.goal ?? "").trim() || row.delegationId, 60);
  const details = metaRow([
    row.status ? truncate(row.status, 40) : null,
    row.dispatchedAt !== null ? `abgeschickt ${formatStamp(row.dispatchedAt)}` : null,
    row.completedAt !== null ? `abgeschlossen ${formatStamp(row.completedAt)}` : null,
  ]);
  return (
    <details className="hermesv2-work-row is-delegation" {...workRowProps("delegation", row.key)}>
      <summary className="hermesv2-work-summary" aria-label={`Fehlerdelegation: ${name}`}>
        <span className="hermesv2-work-name">{name}</span>
        <span className="hermesv2-work-state" data-status="failed">
          {row.status !== null ? truncate(row.status, 30) : "unbekannt"}
        </span>
      </summary>
      <div className="hermesv2-work-body">
        {details ? <p className="hermesv2-work-detail">{details}</p> : null}
        {row.error ? <p className="hermesv2-work-goal">{truncate(row.error, 400)}</p> : null}
      </div>
    </details>
  );
}

export function WorkTaskRow({ row }: { row: HermesV2WorkTask & { key: string } }) {
  const kind = taskKindLabel(row.kind);
  const name = truncate((row.text ?? "").trim() || row.id, 60);
  return (
    <div className="hermesv2-work-row is-task" {...workRowProps(row.kind, row.key)}>
      <p className="hermesv2-work-taskline" aria-label={`Nebenaufgabe ${kind}: ${name}`}>
        <span className="hermesv2-work-name">{name}</span>
        <span className="hermesv2-work-state" data-status={row.status}>
          {row.status === "running" ? "läuft" : "fertig"}
        </span>
      </p>
    </div>
  );
}

export function WorkActionEntry({ entry }: { entry: ChatWorkActionView }) {
  const rows = actionRows(entry).map((text) => truncate(text, 200));
  return (
    <p className={`hermesv2-work-actionline is-${entry.status}`} data-hermes-work-action={entry.action}>
      {rows.map((text, index) => <span key={index}>{text}{" "}</span>)}
    </p>
  );
}
