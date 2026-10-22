import type { HermesV2WorkRoster } from "@wrapt/contracts/hermes-v2";
import { GatewayError } from "../errors.js";

/** Eine begrenzte Projektion erzeugen; weder Eingaberoster noch dessen Zeilen verändern. */
export function boundWorkRoster(value: HermesV2WorkRoster, maximumBytes: number, mode: "rows" | "complete" = "complete"): HermesV2WorkRoster {
  const roster = { ...value, tasks: [...value.tasks], subagents: [...value.subagents], delegations: [...value.delegations],
    processes: [...value.processes], coverage: { ...value.coverage } };
  const bytes = () => Buffer.byteLength(JSON.stringify(roster));
  const lists = [roster.tasks, roster.subagents, roster.delegations, roster.processes];
  while (bytes() > maximumBytes) {
    const largest = [...lists].sort((a, b) => Buffer.byteLength(JSON.stringify(b)) - Buffer.byteLength(JSON.stringify(a)))[0]!;
    if (!largest.length) break;
    largest.pop(); roster.coverage.truncated = true;
  }
  if (bytes() <= maximumBytes || mode === "rows") return roster;
  roster.coverage.truncated = true;
  const queued = roster.queuedText;
  roster.queuedText = queued === null ? null : "";
  if (bytes() > maximumBytes) throw new GatewayError("RATE_LIMITED", "Das Ausgabebudget reicht nicht für die Laufaufgaben-Metadaten.");
  if (queued !== null) {
    const prefix = (end: number) => queued.slice(0, end).replace(/[\uD800-\uDBFF]$/u, "");
    let low = 0; let high = queued.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      roster.queuedText = prefix(middle);
      if (bytes() <= maximumBytes) low = middle;
      else high = middle - 1;
    }
    roster.queuedText = prefix(low);
  }
  return roster;
}
