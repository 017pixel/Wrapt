import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workFixture } from "./test.fixture.js";

describe("R2-H1: echte Secretantworten in Work, Legacy und Aktionen bei exakten IDs", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { await f.close(); });
  async function learn(value: string) {
    const id = `srq-${randomUUID()}`;
    f.core.request(f.session, "secret", { label: "Synthetische Testeingabe" }, id);
    const record = f.client.manager.sessions.records.get(f.session.id)!;
    await expect.poll(() => record.snapshot.requests.length).toBe(1);
    const request = record.snapshot.requests[0]!;
    expect(await f.client.run({ op: "request.respond", sessionId: f.session.id, epoch: request.epoch,
      requestKey: request.key, response: { kind: "secret", value } })).toMatchObject({ type: "result" });
    await expect.poll(() => f.core.responses.some((response) => response.id === id)).toBe(true);
  }
  it.each(["prefix", "suffix", "middle"])("zuerst bekannter %s zerstört keine spätere vollständige Maske", async (position) => {
    const secret = "Q7SyntheticCredential7654321";
    const short = position === "prefix" ? secret.slice(0, 2) : position === "suffix" ? secret.slice(-2) : secret.slice(4, 6);
    await learn(short); await learn(secret); expect(f.core.responses).toHaveLength(2);
    f.children.push({ subagent_id: secret, parent_id: secret, delegation_id: secret, goal: secret, model: secret, last_tool: secret });
    f.delegations.push({ delegation_id: secret, task_index: 1, goal: secret, error: secret });
    f.processes.push({ session_id: secret, command: secret, output_tail: secret, status: "running" });
    const roster = await f.read();
    expect(roster.subagents[0]).toMatchObject({ id: secret, parentId: secret, delegationId: secret, goal: "***", model: "***", lastTool: "***" });
    expect(roster.delegations[0]).toMatchObject({ delegationId: secret, taskIndex: 1, goal: "***", error: "***" });
    expect(roster.processes[0]).toMatchObject({ id: secret, command: "***", output: "***" });
    expect(await f.client.run({ op: "subagents.read", sessionId: f.session.id })).toMatchObject({ type: "result", data: {
      subagents: [{ id: secret, goal: "***", model: "***", lastTool: "***" }], background: [{ id: secret, command: "***", output: "***" }] } });
    f.event("subagent.start", { subagent_id: secret, parent_id: secret, delegation_id: secret, goal: secret, model: secret });
    await expect.poll(() => f.client.manager.sessions.records.get(f.session.id)?.seq).toBe(f.session.seq);
    expect(f.client.messages.findLast((frame) => frame.type === "event" && frame.event.type === "work.updated"))
      .toMatchObject({ event: { payload: { change: { id: secret, parentId: secret, delegationId: secret, goal: "***", model: "***" } } } });
    f.tail(secret);
    expect(await f.client.run({ op: "work.subagent.tail", sessionId: f.session.id, subagentId: secret }))
      .toMatchObject({ type: "result", data: { id: secret, text: "***", available: true } });
    f.kill({ session_id: secret, status: "killed", output: secret, error: secret });
    expect(await f.client.run({ op: "work.process.kill", sessionId: f.session.id, processId: secret }))
      .toMatchObject({ type: "result", data: { id: secret, output: "***", error: "***", status: "killed" } });
  });
});
