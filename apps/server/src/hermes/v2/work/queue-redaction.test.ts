import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redactWorkRoster } from "./redact.js";
import { workFixture } from "./test.fixture.js";

describe("R2-L1: tatsächliche Queuebegrenzung nach Maskenwachstum", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { await f.close(); });
  it.each([66_666, 66_667])("Maskenwachstum über %d Vorkommen bewahrt das Budget samt Coverage", async (count) => {
    f.client.manager.secrets.remember("Q"); f.queue("Q".repeat(count) + "!.");
    const roster = await f.read(); const expected = "***".repeat(count) + "!.";
    expect(roster.queuedText).toBe(expected.slice(0, 200_000));
    expect(roster.coverage.truncated).toBe(expected.length > 200_000);
  });
  it("ein erst im finalen Sendepfad bekanntes Secret aktualisiert Coverage ohne Eingabemutation", async () => {
    const value = "Q".repeat(70_000) + " harmless-tail"; f.queue(value);
    const original = await f.read(); expect(original.coverage.truncated).toBe(false);
    f.client.manager.secrets.remember("Q"); const final = redactWorkRoster(original, f.client.manager.secrets);
    expect(final.queuedText).toBe(("***".repeat(70_000) + " harmless-tail").slice(0, 200_000));
    expect(final.coverage.truncated).toBe(true);
    expect(original.queuedText).toBe(value); expect(original.coverage.truncated).toBe(false);
  });
  it("schrumpfende Maskierung erhält harmloses Ende auch bei langer nativer Eingabe", async () => {
    f.client.manager.secrets.remember("Q7LongSynthetic7654321");
    f.queue("Q7LongSynthetic7654321".repeat(10_000) + " harmless-tail");
    const roster = await f.read(); expect(roster.queuedText).toBe("***".repeat(10_000) + " harmless-tail");
    expect(roster.coverage.truncated).toBe(false);
  });
});
