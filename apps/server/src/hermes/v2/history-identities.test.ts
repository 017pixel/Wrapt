import { describe, expect, it } from "vitest";
import { hermesV2MessageSchema } from "@wrapt/contracts/hermes-v2";
import { normalizeHistory } from "./normalize-history.js";
import { withReplayTools } from "./snapshot-tools.js";

const uidA = "a".repeat(32);
const uidB = "b".repeat(32);
const call = (argumentsText: string) => ({ id: "call-1", function: { name: "test", arguments: argumentsText } });
const scope = { epoch: "epoch-a", liveId: "live-a", running: true };

describe("History: Nachrichten- und Tool-Vorkommen", () => {
  it("ordnet denselben Provider-Call in zwei echten Turns korrekt zu", () => {
    const messages = normalizeHistory([
      { id: 1, role: "assistant", tool_calls: [call("first")] },
      { id: 2, role: "tool", tool_call_id: "call-1", content: "first-result" },
      { id: 3, role: "assistant", tool_calls: [call("second")] },
      { id: 4, role: "tool", tool_call_id: "call-1", content: "second-result" },
    ], "stored");
    const tools = messages.filter((entry) => entry.role === "tool");
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ rowId: 2, input: "first", text: "first-result", toolStatus: "complete" });
    expect(tools[1]).toMatchObject({ rowId: 4, input: "second", text: "second-result", toolStatus: "complete" });
    expect(new Set(messages.map((entry) => entry.id)).size).toBe(messages.length);
    expect(tools[0]?.id).not.toBe(tools[1]?.id);
  });

  it("nutzt echte Occurrence-UIDs über getrennte Seiten und Compaction-Kopien", () => {
    const makeCalls = (id: number) => normalizeHistory([{ id, message_uid: uidB, role: "assistant", tool_calls: [call("input")], tool_call_uids: JSON.stringify({ "call-1": uidA }) }], "stored");
    const first = makeCalls(1).find((entry) => entry.role === "tool")!;
    const copy = makeCalls(100).find((entry) => entry.role === "tool")!;
    const result = normalizeHistory([{ id: 200, role: "tool", tool_call_id: "call-1", tool_call_uid: uidA, message_uid: uidB, content: "output" }], "stored", 0)[0]!;
    expect(first.id).toBe(`tool:occ:${uidA}`);
    expect(copy.id).toBe(first.id);
    expect(result).toMatchObject({ id: first.id, rowId: 200, logicalId: uidB, input: null, text: "output", toolStatus: "complete" });
    expect(first.logicalId).toBeNull();
  });

  it("ordnet mehrere gleich benannte Calls innerhalb einer Row anhand der UID-Liste zu", () => {
    const messages = normalizeHistory([
      { id: 1, role: "assistant", tool_calls: [call("first"), call("second")], tool_call_uids: { "call-1": [uidA, uidB] } },
      { id: 2, role: "tool", tool_call_id: "call-1", tool_call_uid: uidB, content: "second-result" },
      { id: 3, role: "tool", tool_call_id: "call-1", tool_call_uid: uidA, content: "first-result" },
    ], "stored");
    expect(messages.find((entry) => entry.id === `tool:occ:${uidA}`)).toMatchObject({ rowId: 3, input: "first", text: "first-result" });
    expect(messages.find((entry) => entry.id === `tool:occ:${uidB}`)).toMatchObject({ rowId: 2, input: "second", text: "second-result" });
  });

  it("rät bei wiederholten Legacy-Calls und fehlenden Seiten keine Input-/Result-Verbindung", () => {
    const standalone = normalizeHistory([{ id: 9, role: "tool", tool_call_id: "call-1", content: "result" }], "stored")[0]!;
    expect(standalone).toMatchObject({ id: "row:9", input: null, toolStatus: "unknown" });
    const messages = normalizeHistory([
      { id: 1, role: "assistant", tool_calls: [call("first"), call("second")] },
      { id: 2, role: "tool", tool_call_id: "call-1", content: "ambiguous" },
    ], "stored");
    expect(messages.filter((entry) => entry.role === "tool")).toHaveLength(3);
    expect(messages.find((entry) => entry.rowId === 2)).toMatchObject({ id: "row:2", input: null, toolStatus: "unknown" });
    expect(new Set(messages.map((entry) => entry.id)).size).toBe(messages.length);
  });

  it("verwendet keine fremde oder doppelte Vorkommens-ID als Legacy-Merge-Beweis", () => {
    const messages = normalizeHistory([
      { id: 1, role: "assistant", tool_calls: [call("first"), call("second")], tool_call_uids: { "call-1": [uidA, uidA] } },
      { id: 2, role: "tool", tool_call_id: "call-1", tool_call_uid: uidB, content: "other" },
    ], "stored");
    expect(new Set(messages.map((entry) => entry.id)).size).toBe(messages.length);
    expect(messages.find((entry) => entry.rowId === 2)).toMatchObject({ id: `tool:occ:${uidB}`, input: null });
  });

  it("verbindet Legacy-Ergebnisse nicht über verdeckte Assistant- oder Usergrenzen hinweg", () => {
    for (const boundary of [{ role: "assistant", display_kind: "hidden" }, { role: "user", content: "Nächster Turn" }, { role: "developer", content: "Scaffold" }]) {
      const messages = normalizeHistory([
        { id: 1, role: "assistant", tool_calls: [call("old")] },
        { id: 2, ...boundary },
        { id: 3, role: "tool", tool_call_id: "call-1", content: "unknown" },
      ], "stored");
      expect(messages.find((entry) => entry.rowId === 3)).toMatchObject({ id: "row:3", input: null, toolStatus: "unknown" });
    }
  });

  it("projiziert nur echte gültige message_uid und lässt optionale alte Verträge zu", () => {
    const first = normalizeHistory([{ id: 1, role: "assistant", content: "gleich", message_uid: uidA }], "stored")[0]!;
    const copy = normalizeHistory([{ id: 100, role: "assistant", content: "geändert", message_uid: uidA }], "stored")[0]!;
    const distinct = normalizeHistory([{ id: 101, role: "assistant", content: "gleich", message_uid: uidB }], "stored")[0]!;
    expect(first.logicalId).toBe(copy.logicalId);
    expect(distinct.logicalId).not.toBe(first.logicalId);
    expect(first.rowId).not.toBe(copy.rowId);
    for (const invalid of [null, 17, "invalid UID", "a".repeat(33)]) {
      expect(normalizeHistory([{ id: 2, role: "user", message_uid: invalid }], "stored")[0]?.logicalId).toBeNull();
    }
    const { logicalId: ignored, ...legacy } = first;
    expect(ignored).toBe(uidA);
    expect(hermesV2MessageSchema.safeParse(legacy).success).toBe(true);
    expect(hermesV2MessageSchema.safeParse({ ...legacy, logicalId: null }).success).toBe(true);
  });

  it("überschreibt alte History beim Replay derselben Provider-ID nicht", () => {
    const history = normalizeHistory([{ id: 1, role: "assistant", tool_calls: [call("old")] }, { id: 2, role: "tool", tool_call_id: "call-1", content: "old-result" }], "stored");
    const output = withReplayTools(history, [
      { type: "message.start", seq: 10 },
      { type: "tool.start", seq: 11, payload: { tool_id: "call-1", name: "test", args: "new" } },
      { type: "tool.complete", seq: 12, payload: { tool_id: "call-1", name: "test", result_text: "new-result" } },
      { type: "tool.start", seq: 13, payload: { tool_id: "call-1", name: "test", args: "third" } },
    ], scope);
    const tools = output.filter((entry) => entry.role === "tool");
    expect(tools).toHaveLength(3);
    expect(tools[0]).toMatchObject({ rowId: 2, input: "old", text: "old-result" });
    expect(tools[1]).toMatchObject({ input: "new", text: "new-result", toolStatus: "complete" });
    expect(tools[2]).toMatchObject({ input: "third", text: "", toolStatus: "running" });
    expect(new Set(tools.map((entry) => entry.id)).size).toBe(3);
    const other = withReplayTools([], [{ type: "tool.start", seq: 13, payload: { tool_id: "call-1", name: "test" } }], { ...scope, epoch: "other" });
    expect(other[0]?.id).not.toBe(tools[2]?.id);
    expect(withReplayTools(history, [{ type: "tool.complete", seq: 20, payload: { tool_id: "call-1", result_text: "orphan" } }], scope)).toEqual(history);
    expect(withReplayTools(history, [], { ...scope, running: false })).toEqual(history);
  });
});
