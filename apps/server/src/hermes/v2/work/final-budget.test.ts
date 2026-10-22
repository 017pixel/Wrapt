import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resultData } from "./test.fixture.js";
import { redactionFixture } from "./redaction-test.fixture.js";

describe("R3-L2: tatsächlicher Managerframe nach dynamischer Maskierung", () => {
  let f: Awaited<ReturnType<typeof redactionFixture>>;
  beforeEach(async () => { f = await redactionFixture(); });
  afterEach(async () => { await f.close(); });
  for (const budget of [1_048_576, 65_536]) for (const late of [false, true]) {
    it(`Browserbudget ${budget}, Secret nach Nativeawait=${late}`, async () => {
      Object.assign(f.pool.policy, { browserBytes: budget });
      expect(f.client.manager.policy.browserBytes).toBe(budget);
      for (let index = 0; index < 100; index++) f.processes.push({ session_id: `exact-${index}`, status: "running", output_tail: "Q".repeat(3999) + "!" });
      const previous = JSON.stringify(f.processes);
      if (!late) await f.learn("Q");
      const gate = late ? f.holdPostNative() : null; const pending = f.run();
      try {
        if (gate) { await gate.entered; await f.learn("Q"); gate.release(); }
        const frame = await pending, roster = resultData(frame);
        expect(Buffer.byteLength(JSON.stringify(frame))).toBeLessThanOrEqual(budget);
        expect(roster.processes.length).toBeGreaterThan(0); expect(roster.processes.length).toBeLessThan(100);
        expect(roster.coverage.truncated).toBe(true);
        expect(roster.processes.every((row) => row.id.startsWith("exact-") && row.output === "***".repeat(3999) + "!")).toBe(true);
        expect(JSON.stringify(f.processes)).toBe(previous);
      } finally { gate?.release(); }
    });
  }
});
