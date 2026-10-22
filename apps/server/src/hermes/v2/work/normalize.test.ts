import { describe, expect, it } from "vitest";
import { normalizeWorkPatch, normalizeWorkProcess, boundedOutput } from "./normalize.js";

describe("Workquellen und Teilpatches", () => {
  it("erhält Auslassungen und unterscheidet explizites null", () => {
    expect(normalizeWorkPatch({ type: "subagent.tool", payload: { subagent_id: "kind", tool_name: "terminal" } }))
      .toEqual({ kind: "subagent", id: "kind", lastTool: "terminal" });
    expect(normalizeWorkPatch({ type: "subagent.progress", payload: { subagent_id: "kind", model: null } }))
      .toEqual({ kind: "subagent", id: "kind", model: null });
  });
  it.each([["spawn_requested", "queued"], ["start", "running"], ["complete", null]])("native %s trägt ausschließlich belegten Status", (type, status) => {
    expect(normalizeWorkPatch({ type: `subagent.${type}`, payload: { subagent_id: "kind" } })).toMatchObject({ status });
  });
  it("identitätslose Events erfinden kein Kind, Delegationsindex bleibt Teil der Identität", () => {
    expect(normalizeWorkPatch({ type: "subagent.start", payload: { goal: "Kein Beleg" } })).toBeNull();
    expect(normalizeWorkPatch({ type: "subagent.start", payload: { delegation_id: "delegation", task_index: 2 } }))
      .toEqual({ kind: "delegation", delegationId: "delegation", taskIndex: 2, status: "running" });
    expect(normalizeWorkPatch({ type: "subagent.start", payload: { delegation_id: "delegation" } })).toBeNull();
  });
  it("Prozessidentität bleibt eigenständig und unbekannte Werte werden nicht zu null oder Zeitnull geraten", () => {
    expect(normalizeWorkProcess({ session_id: "prozess", started_at: "2026-10-17T00:00:00Z", exit_code: -9 }))
      .toMatchObject({ kind: "process", id: "prozess", startedAt: Date.parse("2026-10-17T00:00:00Z"), exitCode: -9, uptimeSeconds: null });
    expect(normalizeWorkProcess({ session_id: "prozess" })).toMatchObject({ command: null, status: null, startedAt: null, exitCode: null });
  });
  it("multibyte Ausgabe hält die tatsächliche 16KiB-Grenze", () => {
    expect(Buffer.byteLength(boundedOutput("ä".repeat(20_000)))).toBeLessThanOrEqual(16_384);
    expect(boundedOutput("ä".repeat(20_000))).not.toContain("\uFFFD");
  });
});
