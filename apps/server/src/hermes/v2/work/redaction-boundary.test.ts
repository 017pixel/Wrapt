import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import type { HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deferred } from "../attachments/await-context.fixture.js";
import { workFixture } from "./test.fixture.js";

type Field = "goal" | "model" | "error" | "command" | "output_tail";
describe("H1: bekannte und später bekannte Secrets an Workgrenzen", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  const original = fs.lstat;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { fs.lstat = original; syncBuiltinESMExports(); await f.close(); });
  const secret = "GatePrivateValue_7365";
  function value(limit: number) { return "x".repeat(limit - secret.length + 1) + secret; }
  function seed(field: Field, content: string) {
    if (field === "error") f.delegations.push({ delegation_id: "routing-delegation", task_index: 1, status: "failed", error: content });
    else if (field === "command" || field === "output_tail") f.processes.push({ session_id: "routing-process", [field]: content, status: "running" });
    else f.children.push({ subagent_id: "routing-child", [field]: content, status: "running" });
  }
  function output(frame: HermesV2ServerMessage, field: Field): string {
    if (frame.type !== "result" || frame.op !== "work.read") throw new Error("Kein Workroster");
    return field === "error" ? frame.data.delegations[0]!.error! : field === "command" ? frame.data.processes[0]!.command!
      : field === "output_tail" ? frame.data.processes[0]!.output : frame.data.subagents[0]![field]!;
  }
  const fields: Array<[Field, number]> = [["goal", 10_000], ["model", 200], ["error", 4_000], ["command", 4_000], ["output_tail", 16_384]];
  it.each(fields)("%s maskiert den vollständigen Wert vor Kürzung bei %d", async (field, limit) => {
    f.client.manager.secrets.remember(secret); seed(field, value(limit));
    const frame = await f.run(); expect(output(frame, field)).not.toContain(secret.slice(0, -1));
    if (frame.type === "result" && frame.op === "work.read")
      expect((frame.data.subagents[0] ?? frame.data.processes[0])?.id ?? frame.data.delegations[0]?.delegationId).toMatch(/^routing-/);
  });
  it.each(fields)("%s schützt schon begrenzten Wert, wenn das Secret erst im folgenden FS-Await bekannt wird", async (field, limit) => {
    seed(field, value(limit)); const entered = deferred(); const release = deferred(); const hook = f.core.resultHook!;
    let native = false; let held = false;
    f.core.resultHook = (method, params, raw) => { const result = hook(method, params, raw); if (method === "process.list") native = true; return result; };
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await original(...args);
      if (native && String(args[0]) === f.home && !held) { held = true; entered.resolve(); await release.promise; }
      return stat;
    }) as typeof fs.lstat;
    syncBuiltinESMExports(); const pending = f.run();
    try {
      await entered.promise; f.client.manager.secrets.remember(secret); release.resolve();
      expect(output(await pending, field)).not.toContain(secret.slice(0, -1));
    } finally { release.resolve(); }
  });
  it("Event und später erneut gelesene gecachte Goalfragmente bleiben maskiert, inklusive Legacyframe", async () => {
    f.event("subagent.start", { subagent_id: "routing-child", goal: value(10_000) });
    await expect.poll(() => f.client.manager.sessions.records.get(f.session.id)?.seq).toBe(f.session.seq);
    f.client.manager.secrets.remember(secret);
    expect(output(await f.run(), "goal")).not.toContain(secret.slice(0, -1));
    f.client.messages.length = 0; f.event("subagent.start", { subagent_id: "routing-child", goal: value(10_000) });
    await expect.poll(() => f.client.manager.sessions.records.get(f.session.id)?.seq).toBe(f.session.seq);
    expect(JSON.stringify(f.client.messages)).not.toContain(secret.slice(0, -1));
  });
  it.each(["tail", "output", "error", "utf8-tail"] as const)("%s schützt Zeichen- und Bytegrenzen vor vollständigen bekannten Echos", async (field) => {
    const unicode = field === "utf8-tail"; const known = unicode ? "GatePrivatÄÖÜ12345678" : secret;
    f.client.manager.secrets.remember(known);
    const limit = field === "error" ? 4_000 : 16_384;
    const budget = limit - Buffer.byteLength(known.slice(0, -1));
    const prefix = unicode ? "ä".repeat(Math.floor(budget / 2)) + "x".repeat(budget % 2) : "x".repeat(budget);
    const content = prefix + known;
    f.children.push({ subagent_id: "routing-child" }); f.processes.push({ session_id: "routing-process" });
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, raw) => {
      const result = hook(method, params, raw);
      if (method === "subagent.tail") return { ...result as object, text: content };
      if (method === "process.kill") return { ...result as object, [field === "error" ? "error" : "output"]: content };
      return result;
    };
    const frame = await f.client.run(field.endsWith("tail") ? { op: "work.subagent.tail", sessionId: f.session.id, subagentId: "routing-child" }
      : { op: "work.process.kill", sessionId: f.session.id, processId: "routing-process" });
    expect(frame.type).toBe("result"); expect(JSON.stringify(frame)).not.toContain(known.slice(0, -1));
  });
});
