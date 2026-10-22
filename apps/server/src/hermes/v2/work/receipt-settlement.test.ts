import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workFixture } from "./test.fixture.js";

describe("M1: Settlement offener Receipts unabhängig vom sichtbaren Roster", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { await f.close(); });
  it.each(["background", "btw"] as const)("%s bleibt nach130 fremden Completions und eigener später Quittung completed", async (kind) => {
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, raw) => {
      const result = hook(method, params, raw);
      if (method === `prompt.${kind}`) {
        f.event(`${kind}.complete`, { task_id: "nebenaufgabe", text: "Tatsächlicher Abschluss" });
        for (let n = 0; n < 130; n++) f.event(`${kind}.complete`, { task_id: `anderer-${n}`, text: "Abgeschlossen" });
      }
      return result;
    };
    const frame = await f.client.run({ op: kind === "btw" ? "work.btw" : "work.background", sessionId: f.session.id, text: "Eigenes Ziel" });
    expect(frame.type).toBe("result"); const roster = await f.read();
    expect(roster.tasks.find((row) => row.id === "nebenaufgabe")).toMatchObject({ kind, status: "completed" });
    expect(f.client.manager.work.state.active(f.client.manager.sessions.records.get(f.session.id)!)).toBe(false);
    expect(f.count(`prompt.${kind}`)).toBe(1); expect(roster.coverage.truncated).toBe(true);
  });
  it("beide begrenzten Evidenzspeicher dürfen bei Überlauf keinen erneuten running-Beleg erfinden", async () => {
    const hook = f.core.resultHook!; const count = f.client.manager.policy.maxPending + 2;
    f.core.resultHook = (method, params, raw) => {
      const result = hook(method, params, raw);
      if (method === "prompt.background") {
        for (let n = 0; n < count; n++) f.event("background.complete", { task_id: `vorher-${n}`, text: "Fertig" });
        f.event("background.complete", { task_id: "nebenaufgabe", text: "Tatsächlich fertig" });
        for (let n = 0; n < count; n++) f.event("background.complete", { task_id: `nachher-${n}`, text: "Fertig" });
      }
      return result;
    };
    expect(await f.client.run({ op: "work.background", sessionId: f.session.id, text: "Eigenes Ziel" })).toMatchObject({ type: "error", outcome: "unknown" });
    const record = f.client.manager.sessions.records.get(f.session.id)!;
    expect(f.client.manager.work.state.get(record).tasks.get("background\0nebenaufgabe")?.status).not.toBe("running");
    expect(f.client.manager.retainRuntime).toBe(true); expect(f.count("prompt.background")).toBe(1);
  });
});
