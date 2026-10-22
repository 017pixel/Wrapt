import type { HermesV2WorkRoster } from "@wrapt/contracts/hermes-v2";
import { describe, expect, it } from "vitest";
import { boundWorkRoster } from "./output-budget.js";

const empty = (): HermesV2WorkRoster => ({ revision: 1, subagents: [], delegations: [], processes: [], tasks: [], queuedText: null,
  coverage: { subagents: "live-and-observed", delegations: "recent-failures-partial", processes: "session", tasks: "observed-partial", queue: "next-only", truncated: false } });
describe("Workrosterbudget bei kleinem konfiguriertem Browserbudget", () => {
  it.each(["中", "😀", '"\\'])("einziger Queuekopf %s bleibt im Gesamtbudget und die Eingabe unverändert", (unit) => {
    const source = { ...empty(), queuedText: unit.repeat(1000) }; const previous = JSON.stringify(source);
    const result = boundWorkRoster(source, 512);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(512);
    expect(result.coverage.truncated).toBe(true); expect(result.queuedText!.length).toBeGreaterThan(0);
    expect(source.queuedText!.startsWith(result.queuedText!)).toBe(true);
    expect(result.queuedText).not.toMatch(/[\uD800-\uDBFF]$/u);
    expect(JSON.stringify(source)).toBe(previous);
  });
  it("lehnt ein Budget unter der unvermeidbaren Metadatengröße ab", () => {
    expect(() => boundWorkRoster(empty(), 16)).toThrow(/Ausgabebudget/);
  });
});
