import { hermesV2LogicalIdSchema } from "@wrapt/contracts/hermes-v2";
import { object } from "./normalize-values.js";

export function logicalId(value: unknown): string | null {
  const parsed = hermesV2LogicalIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** SQLite liefert tool_call_uids als JSON-Text; Tests/Importprojektionen auch als Map. */
export function toolOccurrenceIds(calls: readonly unknown[], raw: unknown): Array<string | null> {
  if (typeof raw === "string") {
    if (raw.length > 65_536) return calls.map(() => null);
    try { raw = JSON.parse(raw); } catch { return calls.map(() => null); }
  }
  const map = object(raw);
  const counts = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const value of calls) {
    const id = object(value).id;
    if (typeof id === "string") totals.set(id, (totals.get(id) ?? 0) + 1);
  }
  const result = calls.map((value) => {
    const id = object(value).id;
    if (typeof id !== "string") return null;
    const occurrence = counts.get(id) ?? 0;
    counts.set(id, occurrence + 1);
    const uid = map[id];
    return logicalId(Array.isArray(uid) ? uid[occurrence] : totals.get(id) === 1 ? uid : null);
  });
  // Derselbe Vorkommenszeuge darf nicht zwei verschiedene Calls zusammenfalten.
  return result.map((uid) => uid && result.indexOf(uid) === result.lastIndexOf(uid) ? uid : null);
}
