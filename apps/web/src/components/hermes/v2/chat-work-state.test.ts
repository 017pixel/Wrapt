import { describe, expect, it } from "vitest";
import { acceptedWorkTask, applyWorkPatch, applyWorkRoster, emptyWorkState, workKey, workTree } from "./chat-work-state";
import { workChild, workRoster } from "./chat-work-test-fixtures";

describe("Belegte Workroster und Teilereignisse", () => {
  it("unterscheidet fehlenden Roster von einer belegten leeren partiellen Sicht", () => {
    expect(emptyWorkState()).toMatchObject({ loaded: false, coverage: null, queueObserved: false });
    expect(applyWorkRoster(emptyWorkState(), workRoster({ subagents: [], processes: [] }))).toMatchObject({ loaded: true,
      queueObserved: true, subagents: [], coverage: { tasks: "observed-partial", delegations: "recent-failures-partial" } });
  });
  it("erhält Goal, Modell, Start und Count eines strukturierten Teilpatches", () => {
    const before = applyWorkRoster(emptyWorkState(), workRoster({ revision: 1, subagents: [workChild("a", { toolCount: 8 })] }));
    const next = applyWorkPatch(before, 2, { kind: "subagent", id: "a", lastTool: "read" });
    expect(next.subagents[0]).toMatchObject({ goal: "Echte Aufgabe", model: "test:model", startedAt: 10, toolCount: 8, lastTool: "read" });
    expect(applyWorkPatch(next, 3, { kind: "subagent", id: "a", goal: null }).subagents[0]?.goal).toBeNull();
  });
  it("leitet aus Tokenfortschritt weder Startzeit noch Running ab", () => {
    const state = applyWorkPatch(emptyWorkState(), 1, { kind: "subagent", id: "a", toolCount: 4 });
    expect(state.subagents[0]).toMatchObject({ startedAt: null, status: null, goal: null });
  });
  it("ersetzt Vollroster ohne verschwundene Kinder als erfolgreich zu erfinden", () => {
    const before = applyWorkRoster(emptyWorkState(), workRoster({ revision: 1 }));
    expect(applyWorkRoster(before, workRoster({ revision: 2, subagents: [] })).subagents).toEqual([]);
    expect(applyWorkRoster(before, workRoster({ revision: 0, subagents: [] }))).toBe(before);
  });
  it("bewahrt beide Identitätsteile einer Fehlerdelegation und separate Domänen", () => {
    let state = emptyWorkState();
    for (const taskIndex of [0, 1]) state = applyWorkPatch(state, taskIndex + 1, { kind: "delegation", delegationId: "same", taskIndex, error: "Fehler" });
    state = applyWorkPatch(state, 3, { kind: "subagent", id: "same", status: "running" });
    for (const kind of ["background", "btw"] as const) state = applyWorkPatch(state, 4, { kind, id: "same", status: "completed" });
    const keys = [workKey("delegation", "same", 0), workKey("delegation", "same", 1), workKey("subagent", "same"), workKey("background", "same"), workKey("btw", "same")];
    expect(new Set(keys).size).toBe(5); expect(state.delegations).toHaveLength(2); expect(state.tasks).toHaveLength(2);
  });
  it("bewahrt Completion vor Startquittung und akzeptiert konkreten Abschluss ohne Start", () => {
    const completed = applyWorkPatch(emptyWorkState(), 1, { kind: "background", id: "task", status: "completed", text: "Fertig" });
    expect(acceptedWorkTask(completed, "background", "task")).toBe(completed);
    expect(applyWorkPatch(completed, 2, { kind: "background", id: "task", status: "running" }).tasks[0]?.status).toBe("completed");
    expect(acceptedWorkTask(completed, "btw", "task").tasks).toHaveLength(2);
  });
  it("erfindet aus einem Tasktextpatch keinen fehlenden laufenden Task", () => {
    expect(applyWorkPatch(emptyWorkState(), 1, { kind: "btw", id: "missing", text: "Text" }).tasks).toEqual([]);
  });
  it("ignoriert ältere und dedupliziert gleiche Teilereignisse", () => {
    const patch = { kind: "subagent" as const, id: "a", status: "running" as const };
    const state = applyWorkPatch(emptyWorkState(), 5, patch);
    expect(applyWorkPatch(state, 4, { ...patch, status: "failed" })).toBe(state);
    expect(applyWorkPatch(state, 5, patch).subagents).toHaveLength(1);
  });
  it("begrenzt Eventroster und dedupliziert Vollrosterkennungen", () => {
    let state = emptyWorkState();
    for (let index = 0; index < 140; index++) state = applyWorkPatch(state, index, { kind: "subagent", id: `a${index}` });
    expect(state.subagents).toHaveLength(100);
    expect(applyWorkRoster(state, workRoster({ revision: 200, subagents: [workChild(), workChild("child", { goal: "Letzte Beobachtung" })] })).subagents).toHaveLength(1);
  });
  it("stellt belegte Bäume in Parentreihenfolge dar", () => {
    const rows = workTree([workChild("child", { parentId: "parent", depth: 1 }), workChild("parent")]);
    expect(rows.map((row) => [row.id, row.treeDepth, row.flat])).toEqual([["parent", 0, false], ["child", 1, false]]);
  });
  it.each(["missing", "cycle", "self", "unknown"] as const)("stellt %s sicher flach dar", (kind) => {
    const rows = kind === "missing" ? [workChild("a", { parentId: "absent" })] : kind === "cycle"
      ? [workChild("a", { parentId: "b" }), workChild("b", { parentId: "a" })] : [workChild("a", { parentId: kind === "self" ? "a" : null, depth: null })];
    const view = workTree(rows);
    expect(view).toHaveLength(rows.length); expect(view.every((row) => row.flat && row.parentKey === null && row.treeDepth === 0)).toBe(true);
  });
});
