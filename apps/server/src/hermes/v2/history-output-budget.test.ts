import { describe, expect, it } from "vitest";
import { hermesV2ServerMessageSchema, type HermesV2Message, type HermesV2ServerMessage, type HermesV2Snapshot } from "@wrapt/contracts/hermes-v2";
import { boundHistoryOutput } from "./history-output-budget.js";
import { normalizeHistory } from "./normalize-history.js";
import { normalizeSession } from "./normalize-sessions.js";
import { SecretRedactor } from "./secret-redactor.js";
import { sendBrowserMessage } from "./browser-output.js";

const maximum = 4_194_304;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const id = "00000000-0000-4000-8000-000000000001";
function rows(value = "x".repeat(200_000)): HermesV2Message[] {
  return normalizeHistory(Array.from({ length: 25 }, (_, index) => ({ id: index + 1, role: "assistant", content: value })), "session")
    .map((row, index) => ({ ...row, logicalId: index.toString(16).padStart(32, "0"), readEvidence: "a".repeat(64) }));
}
function history(messages = rows()): HermesV2ServerMessage {
  return { v: 1, type: "result", id, op: "history.read", data: { sessionId: "session", offset: 37, returned: 25, hasMore: true, messages } };
}
function snapshot(messages = rows()): HermesV2Snapshot {
  return { session: normalizeSession("session", {}), epoch: "epoch", cursor: 32, writable: true, blockedReason: null,
    selection: null, reasoningEffort: null, running: true, turnStartedAt: 1, inflight: null, queuedText: null, requests: [], messages };
}
function valid(frame: HermesV2ServerMessage) {
  expect(hermesV2ServerMessageSchema.safeParse(frame).success).toBe(true);
  expect(bytes(frame)).toBeLessThanOrEqual(maximum);
}

describe("History-/Snapshotbudget nach letzter Maskierung", () => {
  it("erhält alle IDs, Metadaten und Pagingwerte und entzieht nur gekürzten Rows den Lesebeleg", () => {
    const small = { ...rows("Vollständig")[0]!, id: "klein", rowId: 99 };
    const original = history([...rows(), small]); const before = JSON.stringify(original);
    const output = boundHistoryOutput(original); valid(output);
    if (output.type !== "result" || output.op !== "history.read" || original.type !== "result" || original.op !== "history.read") throw new Error("History fehlt");
    expect(output.data).toMatchObject({ sessionId: "session", offset: 37, returned: 25, hasMore: true });
    expect(output.data.messages).toHaveLength(26);
    output.data.messages.slice(0, 25).forEach((row, index) => {
      expect(row).toMatchObject({ ...original.data.messages[index], text: expect.stringContaining("[Ausgabe wegen Empfangsbudget gekürzt]"), readEvidence: null });
    });
    expect(output.data.messages[25]).toEqual(small);
    expect(JSON.stringify(original)).toBe(before);
  });

  it.each(["session.subscribe", "session.create", "snapshot"] as const)("begrenzt %s samt Inflight-/Korrekturtexten ohne Statusverlust", (kind) => {
    const data = snapshot(); data.queuedText = "q".repeat(200_000);
    data.inflight = { user: "u".repeat(200_000), assistant: "a".repeat(200_000), displayText: "d".repeat(200_000),
      corrections: Array.from({ length: 25 }, () => "c".repeat(200_000)), streaming: true, displayKind: null, error: null, recoverable: false };
    const original: HermesV2ServerMessage = kind === "snapshot" ? { v: 1, type: "snapshot", snapshot: data }
      : { v: 1, type: "result", id, op: kind, data: { snapshot: data } };
    const before = JSON.stringify(original); const output = boundHistoryOutput(original); valid(output);
    if (output.type !== "snapshot" && !(output.type === "result" && (output.op === "session.subscribe" || output.op === "session.create"))) throw new Error("Snapshot fehlt");
    const result = output.type === "snapshot" ? output.snapshot : output.data.snapshot;
    expect(result).toMatchObject({ session: data.session, epoch: "epoch", cursor: 32, writable: true, running: true, turnStartedAt: 1 });
    expect(result.messages).toHaveLength(25); expect(result.inflight?.corrections).toHaveLength(25);
    expect(result.inflight?.assistant).toContain("[Ausgabe wegen Empfangsbudget gekürzt]");
    expect(result.queuedText).toContain("[Ausgabe wegen Empfangsbudget gekürzt]");
    expect(JSON.stringify(original)).toBe(before);
  });

  it.each(["😀", "\u0001", "\"\\\n"])("berechnet die echten JSON-/UTF8bytes für %j ohne geteilte Surrogate", (value) => {
    const original = history(rows(value.repeat(50_000))); const output = boundHistoryOutput(original); valid(output);
    if (output.type !== "result" || output.op !== "history.read") throw new Error("History fehlt");
    expect(output.data.messages).toHaveLength(25);
    for (const row of output.data.messages) {
      expect(row.text).toContain("[Ausgabe wegen Empfangsbudget gekürzt]");
      expect(Buffer.from(row.text).toString()).toBe(row.text);
    }
  });

  it("lässt einen Frame exakt am Empfangslimit unverändert und begrenzt das nächste Byte", () => {
    const original = history();
    if (original.type !== "result" || original.op !== "history.read") throw new Error("History fehlt");
    let excess = bytes(original) - maximum;
    for (const row of original.data.messages) {
      const remove = Math.min(excess, row.text.length); row.text = row.text.slice(remove); excess -= remove;
    }
    expect(bytes(original)).toBe(maximum); expect(boundHistoryOutput(original)).toBe(original);
    original.data.messages[24]!.text += "!";
    expect(bytes(original)).toBe(maximum + 1); valid(boundHistoryOutput(original));
  });

  it("prüft nach Maskenwachstum samt Wrapper und verändert gecachte Rohframes nicht", () => {
    const original = history(rows("Q".repeat(100_000))); const before = JSON.stringify(original);
    const redactor = new SecretRedactor(); redactor.remember("Q"); const sent: HermesV2ServerMessage[] = [];
    sendBrowserMessage({ id: "browser", send: (frame) => sent.push(frame) }, original, redactor, "scope:");
    const output = sent[0]!; valid(output);
    expect(output.type).toBe("result"); expect(JSON.stringify(output)).not.toContain("Q");
    expect(JSON.stringify(output)).toContain("[Ausgabe wegen Empfangsbudget gekürzt]");
    expect(JSON.stringify(original)).toBe(before);
  });

  it("liefert bei unverkürzbarer Metadatenlast einen korrelierten begrenzten Fehler", () => {
    const data = snapshot([]);
    data.requests = Array.from({ length: 100 }, () => ({ key: id, epoch: "epoch", sessionId: "session", createdAt: 1,
      kind: "approval" as const, method: "approval" as const, command: "c".repeat(65_536), description: "d".repeat(10_000), choices: ["deny" as const] }));
    const original: HermesV2ServerMessage = { v: 1, type: "result", id, op: "session.subscribe", data: { snapshot: data } };
    expect(hermesV2ServerMessageSchema.safeParse(original).success).toBe(true);
    const output = boundHistoryOutput(original); valid(output);
    expect(output).toMatchObject({ type: "error", id, code: "RATE_LIMITED", outcome: "not_sent" });
    expect(data.requests).toHaveLength(100);
  });
});
