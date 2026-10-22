import type { HermesV2WorkSubagent, HermesV2WorkDelegation, HermesV2WorkTask, HermesV2WorkPatch } from "@wrapt/contracts/hermes-v2";
import type { SessionRecord } from "../types.js";
import { emptyDelegation, emptySubagent } from "./normalize.js";
import { object } from "../normalize-values.js";

export const terminalWork = (status: string | null | undefined) => ["completed", "failed", "error", "timeout", "interrupted"].includes(status ?? "");
interface State {
  binding: string; revision: number; truncated: boolean; unknown: boolean; observed: boolean;
  subagents: Map<string, HermesV2WorkSubagent>; delegations: Map<string, HermesV2WorkDelegation>; tasks: Map<string, HermesV2WorkTask>;
  settled: Set<string>;
}
/** Ausschließlich begrenzte flüchtige Beobachtungen, keine zweite native Aufgabenquelle. */
export class WorkState {
  private records = new WeakMap<SessionRecord, State>();
  constructor(private limit: number, private sourceRevision: () => string | number = () => 0) {}
  get(record: SessionRecord): State {
    const binding = `${record.epoch}\0${record.liveId}\0${record.contextRevision ?? 0}\0${this.sourceRevision()}`;
    let state = this.records.get(record);
    if (!state || state.binding !== binding) {
      state = { binding, revision: (state?.revision ?? 0) + 1, truncated: false, observed: state?.observed ?? false,
        unknown: state?.unknown === true || [...state?.tasks.values() ?? []].some((task) => task.status === "running")
          || [...state?.subagents.values() ?? []].some((task) => !terminalWork(task.status))
          || [...state?.delegations.values() ?? []].some((task) => !terminalWork(task.status)),
        subagents: new Map(), delegations: new Map(), tasks: new Map(), settled: new Set() };
      this.records.set(record, state);
    }
    return state;
  }
  private put<T>(state: State, map: Map<string, T>, key: string, value: T): void {
    if (!map.has(key) && map.size >= this.limit) {
      const first = [...map.keys()].find((id) => terminalWork(object(map.get(id)).status as string | null)) ?? map.keys().next().value!;
      if (!terminalWork(object(map.get(first)).status as string | null)) state.unknown = true;
      map.delete(first); state.truncated = true;
    }
    map.set(key, value);
  }
  update(record: SessionRecord, change: HermesV2WorkPatch): number | null {
    const state = this.get(record);
    if (change.kind === "subagent") {
      const old = state.subagents.get(change.id) ?? emptySubagent(change.id);
      const merged = { ...old, ...change };
      if ((terminalWork(old.status) || state.settled.has(`subagent:${change.id}`)) && !terminalWork(merged.status)) merged.status = old.status;
      if (JSON.stringify(old) === JSON.stringify(merged)) return null;
      this.put(state, state.subagents, change.id, merged);
    } else if (change.kind === "delegation") {
      const key = JSON.stringify([change.delegationId, change.taskIndex]);
      const old = state.delegations.get(key) ?? emptyDelegation(change.delegationId, change.taskIndex);
      const merged = { ...old, ...change };
      if ((terminalWork(old.status) || state.settled.has(`delegation:${key}`)) && !terminalWork(merged.status)) merged.status = old.status;
      if (JSON.stringify(old) === JSON.stringify(merged)) return null;
      this.put(state, state.delegations, key, merged);
    } else {
      const key = `${change.kind}\0${change.id}`;
      const old = state.tasks.get(key);
      const merged: HermesV2WorkTask = { kind: change.kind, id: change.id, status: change.status ?? old?.status ?? "running", text: change.text === undefined ? old?.text ?? null : change.text };
      if (old?.status === "completed") merged.status = "completed";
      if (JSON.stringify(old) === JSON.stringify(merged)) return null;
      this.put(state, state.tasks, key, merged);
    }
    return ++state.revision;
  }
  invalidate(record: SessionRecord): number { return ++this.get(record).revision; }
  settle(record: SessionRecord, change: HermesV2WorkPatch): void {
    const state = this.get(record);
    const key = change.kind === "subagent" ? `subagent:${change.id}` : change.kind === "delegation"
      ? `delegation:${JSON.stringify([change.delegationId, change.taskIndex])}` : null;
    if (key) { if (state.settled.size >= this.limit * 2) state.settled.delete(state.settled.values().next().value!); state.settled.add(key); }
  }
  unknown(record: SessionRecord): void { this.get(record).unknown = true; }
  active(record: SessionRecord): boolean {
    const state = this.get(record);
    return state.unknown || [...state.tasks.values()].some((task) => task.status === "running")
      || [...state.subagents.values()].some((task) => !terminalWork(task.status) && !state.settled.has(`subagent:${task.id}`))
      || [...state.delegations.values()].some((task) => !terminalWork(task.status) && !state.settled.has(`delegation:${JSON.stringify([task.delegationId, task.taskIndex])}`));
  }
}
