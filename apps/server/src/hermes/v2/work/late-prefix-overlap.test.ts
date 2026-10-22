import type { HermesV2WorkRoster } from "@wrapt/contracts/hermes-v2";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resultData } from "./test.fixture.js";
import { redactionFixture } from "./redaction-test.fixture.js";

type Field = "goal" | "model" | "last_tool" | "error" | "command";
const fields: Array<[Field, number]> = [["goal", 10_000], ["model", 200], ["last_tool", 200], ["error", 4_000], ["command", 4_000]];
const cases = fields.flatMap(([field, limit]) => [false, true].map((reverse) => ({ field, limit, reverse })));
describe("R3-H1: späte überlappende Secretantworten in echten Workreads und Cache", () => {
  let f: Awaited<ReturnType<typeof redactionFixture>>;
  beforeEach(async () => { f = await redactionFixture(); });
  afterEach(async () => { await f.close(); });
  function display(roster: HermesV2WorkRoster, field: Field) {
    if (field === "error") return roster.delegations[0]!.error;
    if (field === "command") return roster.processes[0]!.command;
    return roster.subagents[0]![field === "last_tool" ? "lastTool" : field];
  }
  it.each(cases)("$field nach Nativeawait, lang zuerst=$reverse", async ({ field, limit, reverse }) => {
    const secret = "R3SyntheticCredential87654321", short = secret.slice(0, 2);
    const prefix = "v".repeat(limit - secret.length + 1); const value = prefix + secret;
    if (field === "error") f.delegations.push({ delegation_id: "exact-delegation", task_index: 2, error: value });
    else if (field === "command") f.processes.push({ session_id: "exact-process", command: value });
    else f.children.push({ subagent_id: "exact-child", [field]: value });
    const gate = f.holdPostNative(); const pending = f.run();
    try {
      await gate.entered;
      for (const known of reverse ? [secret, short] : [short, secret]) await f.learn(known);
      gate.release(); const roster = resultData(await pending);
      expect(display(roster, field)).toBe(prefix + "***"); expect(f.core.responses).toHaveLength(2);
      expect((roster.subagents[0] ?? roster.processes[0])?.id ?? roster.delegations[0]?.delegationId).toMatch(/^exact-/);
      expect(f.count("process.kill") + f.count("session.interrupt")).toBe(0);
    } finally { gate.release(); }
  });
  it.each([false, true])("beobachtetes gekürztes Goal aus dem Cache, lang zuerst=%s", async (reverse) => {
    const secret = 'R3"\\\nCacheCredential87654321'; const short = secret.slice(8, 10);
    const encoded = JSON.stringify(secret).slice(1, -1), prefix = "v".repeat(10_000 - encoded.length + 1);
    f.event("subagent.start", { subagent_id: "cached-child", goal: prefix + encoded });
    await expect.poll(() => f.client.manager.sessions.records.get(f.session.id)?.seq).toBe(f.session.seq);
    for (const known of reverse ? [secret, short] : [short, secret]) await f.learn(known);
    expect((await f.read()).subagents.find((row) => row.id === "cached-child")?.goal).toBe(prefix + "***");
    expect(f.core.responses).toHaveLength(2);
  });
});
