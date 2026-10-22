import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resultData, workFixture } from "./test.fixture.js";

describe("R4-L1: erfüllbare kleine Gesamtbudgets erst mit finalem Wrapper entscheiden", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { await f.close(); });
  const heads = [null, "中😀".repeat(400), '"\\'.repeat(1000)];
  for (const budget of [512, 640, 1024, 1_048_576]) for (const [index, head] of heads.entries()) {
    it(`echter Managerframe bei ${budget} Bytes mit Queuevariante ${index}`, async () => {
      Object.assign(f.pool.policy, { browserBytes: budget }); f.queue(head);
      const reads: [number, number] = [f.count("subagent.list"), f.count("process.list")];
      const frame = await f.run(); const roster = resultData(frame);
      expect(Buffer.byteLength(JSON.stringify(frame))).toBeLessThanOrEqual(budget);
      expect([roster.subagents, roster.delegations, roster.processes, roster.tasks]).toEqual([[], [], [], []]);
      if (head === null) {
        expect(roster.queuedText).toBeNull(); expect(roster.coverage.truncated).toBe(false);
      } else {
        expect(roster.queuedText!.length).toBeGreaterThan(0);
        expect(head.startsWith(roster.queuedText!)).toBe(true);
        expect(roster.queuedText).not.toMatch(/[\uD800-\uDBFF]$/u);
        expect(roster.coverage.truncated).toBe(roster.queuedText !== head);
        if (budget === 1_048_576) expect(roster.queuedText).toBe(head);
      }
      expect(f.count("subagent.list") - reads[0]).toBe(1); expect(f.count("process.list") - reads[1]).toBe(1);
      expect(f.count("prompt.submit") + f.count("prompt.background") + f.count("prompt.btw")
        + f.count("process.kill") + f.count("subagent.interrupt")).toBe(0);
    });
  }
  it("ein wirklich unmögliches Budget wird erst in der tatsächlichen finalen Projektion abgewiesen", async () => {
    Object.assign(f.pool.policy, { browserBytes: 256 });
    const data = await f.client.manager.work.read(f.client.id, f.session.id);
    expect(data.queuedText).toBeNull(); expect(data.coverage.truncated).toBe(false);
    expect(await f.run()).toMatchObject({ type: "error", code: "RATE_LIMITED", outcome: "not_sent" });
    expect(f.count("process.kill") + f.count("subagent.interrupt")).toBe(0);
  });
  it("die exakt passende vollständige Metadatenantwort bleibt ohne erfundene Kürzung gültig", async () => {
    const first = await f.run(); const expected = resultData(first);
    const budget = Buffer.byteLength(JSON.stringify(first));
    Object.assign(f.pool.policy, { browserBytes: budget });
    const exact = await f.run(); expect(resultData(exact)).toEqual(expected);
    expect(Buffer.byteLength(JSON.stringify(exact))).toBe(budget); expect(expected.coverage.truncated).toBe(false);
  });
});
