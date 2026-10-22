import { hermesV2MessageSchema, type HermesV2Message } from "@wrapt/contracts/hermes-v2";
import { jsonText, nullableText, object, timestamp } from "./normalize-values.js";
import { logicalId, toolOccurrenceIds } from "./history-identities.js";
import type { SecretRedactor } from "./secret-redactor.js";
import { historyText } from "./history-output-text.js";

export function normalizeHistory(rows: readonly unknown[], storedId: string, offset = 0, secrets?: SecretRedactor): HermesV2Message[] {
  const messages: HermesV2Message[] = [];
  const pending = new Map<string, number[]>();
  const toolsById = new Map<string, number>();
  rows.forEach((value, index) => {
    const row = object(value);
    if (row.display_kind === "hidden") { pending.clear(); return; }
    const role = row.role;
    if (role !== "user" && role !== "assistant" && role !== "tool" && role !== "system") { pending.clear(); return; }
    const candidate = row.row_id ?? row._row_id ?? row.id;
    const rowId = typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0 ? candidate : null;
    const display = object(row.display_metadata).display_text ?? row.display_content;
    const reasoning = row.reasoning ?? row.reasoning_content;
    const parsed = hermesV2MessageSchema.parse({
      id: rowId ? `row:${rowId}` : `${storedId}:${offset + index}:${role}`,
      rowId, logicalId: logicalId(row.message_uid), role,
      text: historyText(display ?? row.text ?? (typeof row.content === "string" ? row.content : ""), 200_000, secrets),
      reasoning: typeof reasoning === "string" ? historyText(reasoning, 200_000, secrets) : null, timestamp: timestamp(row.timestamp),
      toolId: nullableText(row.tool_call_id, 200), toolName: nullableText(row.name ?? row.tool_name, 200, secrets),
      toolStatus: role === "tool" ? "unknown" : null,
      input: row.args === undefined ? null : jsonText(row.args, 65_536, secrets), displayKind: nullableText(row.display_kind, 100),
    });
    if (role === "tool") {
      const occurrence = logicalId(row.tool_call_uid);
      const candidates = pending.get(parsed.toolId ?? "") ?? [];
      const found = occurrence ? toolsById.get(`tool:occ:${occurrence}`) ?? -1
        : candidates.length === 1 ? candidates[0]! : -1;
      const previous = found >= 0 ? messages[found] : undefined;
      const result: HermesV2Message = {
        ...parsed, id: occurrence ? `tool:occ:${occurrence}` : previous?.id ?? parsed.id,
        toolStatus: occurrence || previous ? "complete" : "unknown",
        toolName: parsed.toolName ?? previous?.toolName ?? null, input: parsed.input ?? previous?.input ?? null,
      };
      if (found >= 0) messages[found] = result;
      else {
        toolsById.set(result.id, messages.length);
        messages.push(result);
      }
      if (parsed.toolId && candidates.includes(found)) pending.set(parsed.toolId, candidates.filter((slot) => slot !== found));
      return;
    }
    // Legacy-Ergebnisse binden nur an einen eindeutigen Call im unmittelbar vorhergehenden Assistant-Scope.
    pending.clear();
    messages.push(parsed);
    if (role !== "assistant" || !Array.isArray(row.tool_calls)) return;
    const calls = row.tool_calls.slice(0, 100);
    const occurrences = toolOccurrenceIds(calls, row.tool_call_uids);
    calls.forEach((value, callIndex) => {
      const call = object(value);
      const fn = object(call.function);
      if (typeof call.id !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(call.id)) return;
      const occurrence = occurrences[callIndex];
      const cardId = occurrence ? `tool:occ:${occurrence}` : `tool:${parsed.logicalId ?? parsed.id}:${callIndex}`;
      const previous = toolsById.get(cardId) ?? -1;
      if (previous >= 0) {
        pending.set(call.id, [...(pending.get(call.id) ?? []), previous]);
        return;
      }
      const slot = messages.length;
      toolsById.set(cardId, slot);
      messages.push(hermesV2MessageSchema.parse({
        id: cardId, rowId: null, logicalId: null, role: "tool", text: "", reasoning: null,
        timestamp: timestamp(row.timestamp), toolId: call.id, toolName: nullableText(fn.name, 200, secrets),
        toolStatus: "unknown", input: jsonText(fn.arguments ?? "", 65_536, secrets), displayKind: null,
      }));
      pending.set(call.id, [...(pending.get(call.id) ?? []), slot]);
    });
  });
  return messages.slice(-200);
}
