import type { HermesV2Message } from "@wrapt/contracts/hermes-v2";
import type { ChatMessageView } from "./chat-types";
import { chatPolicy } from "./chat-policy";

export function historyMessage(message: HermesV2Message, readOffset = 0): ChatMessageView {
  const id = message.logicalId ? `uid:${message.logicalId}` : message.id;
  return {
    id, rowId: message.rowId, logicalId: message.logicalId ?? null, role: message.role,
    text: message.role === "tool" ? "" : message.text, reasoning: message.reasoning,
    timestamp: message.timestamp, status: "complete", error: null, readOffset,
    readEvidence: message.role === "assistant" ? message.readEvidence ?? null : null,
    ...(message.role === "user" && message.rowId !== null && message.attachments ? { attachments: message.attachments } : {}),
    tools: message.role !== "tool" ? [] : [{
      id: `history:${message.id}`, toolId: message.toolId ?? message.id,
      turnId: `history:${message.id}`, name: message.toolName ?? "Tool",
      status: message.toolStatus ?? "unknown", outcome: "unknown", input: message.input,
      output: message.text || null, durationMs: null,
    }],
  };
}
export function sameMessage(left: ChatMessageView, right: ChatMessageView): boolean {
  return left.id === right.id || (left.rowId !== null && left.rowId === right.rowId)
    || (left.logicalId !== null && left.logicalId === right.logicalId && left.role === right.role);
}
/** Quellenreihenfolge bleibt erhalten. Gleiche Texte sind niemals ein Identitätsbeleg. */
export function mergeMessages(first: readonly ChatMessageView[], authoritative: readonly ChatMessageView[]): ChatMessageView[] {
  const output: ChatMessageView[] = [];
  const ids = new Map<string, number>();
  const rows = new Map<number, number>();
  const logical = new Map<string, number>();
  for (const message of [...first, ...authoritative]) {
    const logicalKey = message.logicalId ? `${message.role}:${message.logicalId}` : null;
    const index = ids.get(message.id) ?? (message.rowId === null ? undefined : rows.get(message.rowId))
      ?? (logicalKey === null ? undefined : logical.get(logicalKey)) ?? output.length;
    output[index] = message;
    ids.set(message.id, index);
    if (message.rowId !== null) rows.set(message.rowId, index);
    if (logicalKey !== null) logical.set(logicalKey, index);
  }
  return output;
}
export function boundMessages(messages: ChatMessageView[]): ChatMessageView[] {
  let bytes = 0;
  let start = messages.length;
  while (start > 0 && messages.length - start < chatPolicy.maxMessages) {
    const message = messages[start - 1]!;
    const size = 2 * (message.text.length + (message.reasoning?.length ?? 0)
      + message.tools.reduce((total, tool) => total + (tool.input?.length ?? 0) + (tool.output?.length ?? 0), 0));
    if (bytes + size > chatPolicy.maxSessionBytes) break;
    bytes += size;
    start--;
  }
  return messages.slice(start);
}
export function snapshotHistory(previous: readonly ChatMessageView[], incoming: readonly ChatMessageView[]): ChatMessageView[] {
  // Ein begrenzter Snapshot belegt keine Löschung weiterer gespeicherter Rows.
  return mergeMessages(previous, incoming);
}
/** Bestehende Positionen behalten; auch erneuerte ältere Rows sind autoritativ. */
export function olderHistory(previous: readonly ChatMessageView[], incoming: readonly ChatMessageView[]): ChatMessageView[] {
  const added = incoming.filter((message) => !previous.some((entry) => sameMessage(entry, message)));
  return mergeMessages(added, mergeMessages(previous, incoming));
}
export function liveMessage(id: string, role: ChatMessageView["role"], text = ""): ChatMessageView {
  return { id, rowId: null, logicalId: null, role, text, reasoning: null, timestamp: null,
    status: role === "assistant" ? "streaming" : "complete", error: null, tools: [] };
}
