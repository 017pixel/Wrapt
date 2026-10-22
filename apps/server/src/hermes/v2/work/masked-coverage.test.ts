import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redactBrowserMessage } from "../redact-browser.js";
import { resultData } from "./test.fixture.js";
import { redactionFixture } from "./redaction-test.fixture.js";

type Field = "goal" | "model" | "last_tool" | "error" | "command";
const fields: Array<[Field, number]> = [["goal", 10_000], ["model", 200], ["last_tool", 200], ["error", 4_000], ["command", 4_000]];
const cases = fields.flatMap(([field, limit]) => [false, true].flatMap((late) => [false, true].map((over) => ({ field, limit, late, over }))));
describe("R3-L1: ehrliche maskenbedingte Kürzung von Workfeldern", () => {
  let f: Awaited<ReturnType<typeof redactionFixture>>;
  beforeEach(async () => { f = await redactionFixture(); });
  afterEach(async () => { await f.close(); });
  it.each(cases)("$field, später bekannt=$late, über Grenze=$over", async ({ field, limit, late, over }) => {
    const count = Math.floor(limit / 3) + Number(over), suffix = "!".repeat(limit % 3);
    const value = "Q".repeat(count) + suffix, expected = "***".repeat(count) + suffix;
    if (field === "error") f.delegations.push({ delegation_id: "exact-delegation", task_index: 0, error: value });
    else if (field === "command") f.processes.push({ session_id: "exact-process", command: value });
    else f.children.push({ subagent_id: "exact-child", [field]: value });
    if (!late) await f.learn("Q");
    const gate = late ? f.holdPostNative() : null; const pending = f.run();
    try {
      if (gate) { await gate.entered; await f.learn("Q"); gate.release(); }
      const roster = resultData(await pending);
      const output = field === "error" ? roster.delegations[0]!.error : field === "command" ? roster.processes[0]!.command
        : roster.subagents[0]![field === "last_tool" ? "lastTool" : field];
      expect(output).toBe(expected.slice(0, limit)); expect(roster.coverage.truncated).toBe(over);
    } finally { gate?.release(); }
  });
  it.each([false, true])("native Tailantwort hält Bytebudget und Kürzungsmerkmal, über Grenze=%s", async (over) => {
    await f.learn("Q"); f.children.push({ subagent_id: "exact-tail" });
    const count = 5461 + Number(over); f.tail("Q".repeat(count) + "!");
    const answer = await f.client.run({ op: "work.subagent.tail", sessionId: f.session.id, subagentId: "exact-tail" });
    expect(answer).toMatchObject({ type: "result", data: { id: "exact-tail", text: ("***".repeat(count) + "!").slice(0, 16_384), truncated: over } });
  });
  it("erst finale Tailredaction übernimmt tatsächliche Kürzung ohne Eingabemutation", async () => {
    f.children.push({ subagent_id: "exact-tail" }); f.tail("Q".repeat(5462) + "!");
    const original = await f.client.run({ op: "work.subagent.tail", sessionId: f.session.id, subagentId: "exact-tail" });
    expect(original).toMatchObject({ type: "result", data: { truncated: false } });
    const previous = JSON.stringify(original); await f.learn("Q");
    expect(redactBrowserMessage(original, f.client.manager.secrets)).toMatchObject({ type: "result", data: { truncated: true, text: "*".repeat(16_384) } });
    expect(JSON.stringify(original)).toBe(previous);
  });
});
