import type { HermesV2Message, HermesV2ServerMessage, HermesV2Snapshot } from "@wrapt/contracts/hermes-v2";
import { errorMessage, GatewayError } from "./errors.js";
import { historyTruncationNotice as notice } from "./history-output-text.js";

// Empfangsgrenze des GatewayClient, unabhängig vom kleineren Browser-Sendbudget.
const receiveBytes = 4_194_304;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
interface Field { value: string; size: number; set: (value: string) => void }

/** Nur bereits final maskierte Anzeigetexte kürzen. Zeilen und Seitenzählung bleiben erhalten. */
export function boundHistoryOutput(original: HermesV2ServerMessage): HermesV2ServerMessage {
  const applicable = original.type === "snapshot" || original.type === "result"
    && (original.op === "history.read" || original.op === "session.subscribe" || original.op === "session.create");
  if (!applicable || bytes(original) <= receiveBytes) return original;
  const fields: Field[] = [];
  const field = (value: string | null, set: Field["set"]) => {
    if (value !== null && value.length) fields.push({ value, size: bytes(value), set });
  };
  const rows = (messages: HermesV2Message[]) => messages.map((message) => {
    const row = { ...message };
    for (const key of ["text", "reasoning", "input"] as const) field(row[key], (value) => {
      row[key] = value;
      // Ein gekürzter Inhalt belegt nicht mehr die vollständige gelesene Antwort.
      if ("readEvidence" in row) row.readEvidence = null;
    });
    return row;
  });
  const snapshot = (value: HermesV2Snapshot): HermesV2Snapshot => {
    const copy = { ...value, messages: rows(value.messages) };
    field(copy.queuedText, (text) => { copy.queuedText = text; });
    if (copy.inflight) {
      const inflight = { ...copy.inflight, corrections: [...copy.inflight.corrections] };
      copy.inflight = inflight;
      for (const key of ["user", "assistant", "displayText"] as const)
        field(inflight[key], (text) => { inflight[key] = text; });
      inflight.corrections.forEach((value, index) => field(value, (text) => { inflight.corrections[index] = text; }));
    }
    return copy;
  };
  let message: HermesV2ServerMessage = original;
  if (original.type === "snapshot") message = { ...original, snapshot: snapshot(original.snapshot) };
  else if (original.type === "result") {
    if (original.op === "history.read") message = { ...original, data: { ...original.data, messages: rows(original.data.messages) } };
    else if (original.op === "session.subscribe" || original.op === "session.create")
      message = { ...original, data: { snapshot: snapshot(original.data.snapshot) } };
  }
  // Kleine Felder vollständig erhalten; das übrige Budget gleichmäßig auf große verteilen.
  let available = receiveBytes - bytes(original) + fields.reduce((sum, field) => sum + field.size, 0);
  let remaining = fields.length;
  const sorted = [...fields].sort((left, right) => left.size - right.size);
  for (const entry of sorted) {
    if (entry.size > Math.floor(available / remaining)) break;
    available -= entry.size;
    remaining--;
  }
  const quota = remaining ? Math.floor(available / remaining) : 0;
  if (quota >= bytes(notice)) {
    for (const entry of fields) {
      if (entry.size <= quota) continue;
      let low = 0; let high = entry.value.length;
      const prefix = (end: number) => entry.value.slice(0, end).replace(/[\uD800-\uDBFF]$/u, "") + notice;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        const candidate = prefix(middle);
        if (candidate.length <= entry.value.length && bytes(candidate) <= quota) low = middle;
        else high = middle - 1;
      }
      entry.set(prefix(low));
    }
    if (bytes(message) <= receiveBytes) return message;
  }
  // Auch strukturell zu große Snapshots bleiben ein begrenzter, korrelierter Fehler.
  return errorMessage(new GatewayError("RATE_LIMITED", "Die Verlaufsmetadaten überschreiten das Empfangsbudget.",
    original.type === "result" && original.op === "session.create" ? "unknown" : "not_sent"),
  original.type === "result" ? original.id : null);
}
