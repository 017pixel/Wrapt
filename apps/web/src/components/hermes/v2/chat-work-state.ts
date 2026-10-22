import type { HermesV2WorkPatch, HermesV2WorkRoster, HermesV2WorkSubagent, HermesV2WorkDelegation, HermesV2WorkTask } from "@wrapt/contracts/hermes-v2";
import type { ChatWorkSubagentView } from "./chat-work-types";
import type { ChatErrorInfo } from "./chat-types";
import { chatPolicy } from "./chat-policy";

export interface ChatWorkState extends Omit<HermesV2WorkRoster, "revision" | "coverage"> {
  revision: number | null; coverage: HermesV2WorkRoster["coverage"] | null;
  loaded: boolean; loading: boolean; error: ChatErrorInfo | null; queueObserved: boolean;
}
export const emptyWorkState = (queuedText: string | null = null, queueObserved = false): ChatWorkState => ({
  revision: null, coverage: null, loaded: false, loading: false, error: null,
  subagents: [], delegations: [], processes: [], tasks: [], queuedText, queueObserved,
});
export const workKey = (kind: string, id: string, index?: number) => JSON.stringify(index === undefined ? [kind, id] : [kind, id, index]);
export const workActive = (status: string | null) => status === "running" || status === "queued";
const emptySubagent = (id: string): HermesV2WorkSubagent => ({ kind: "subagent", id, parentId: null, depth: null, delegationId: null,
  goal: null, model: null, startedAt: null, status: null, toolCount: null, lastTool: null, acceptingSteer: null, durationMs: null });
const emptyDelegation = (delegationId: string, taskIndex: number): HermesV2WorkDelegation => ({ kind: "delegation", delegationId,
  taskIndex, status: null, goal: null, error: null, dispatchedAt: null, completedAt: null });
function mergeDefined<T>(base: T, patch: { [K in keyof T]?: T[K] | undefined }): T {
  const next = { ...base };
  for (const key of Object.keys(patch) as (keyof T)[]) if (patch[key] !== undefined) next[key] = patch[key];
  return next;
}
/** Lokaler Belegverlust bleibt sichtbar, bis ein neuer Vollroster ihn ersetzt. */
function boundWork(state: ChatWorkState): ChatWorkState {
  if (![state.subagents, state.delegations, state.processes, state.tasks].some((rows) => rows.length > chatPolicy.workRows)) return state;
  return { ...state, coverage: state.coverage ? { ...state.coverage, truncated: true } : null,
    subagents: state.subagents.slice(-chatPolicy.workRows), delegations: state.delegations.slice(-chatPolicy.workRows),
    processes: state.processes.slice(-chatPolicy.workRows), tasks: state.tasks.slice(-chatPolicy.workRows) };
}

/** Vollroster ersetzt nur eine mindestens ebenso neue belegte Sicht. */
export function applyWorkRoster(state: ChatWorkState, roster: HermesV2WorkRoster): ChatWorkState {
  if (state.revision !== null && roster.revision < state.revision) return state;
  const unique = <T>(rows: T[], key: (row: T) => string): T[] => [...new Map(rows.map((row) => [key(row), row])).values()];
  return { ...roster, subagents: unique(roster.subagents, (row) => row.id),
    delegations: unique(roster.delegations, (row) => workKey(row.kind, row.delegationId, row.taskIndex)),
    processes: unique(roster.processes, (row) => row.id), tasks: unique(roster.tasks, (row) => workKey(row.kind, row.id)),
    loaded: true, loading: false, error: null, queueObserved: true };
}
export function applyWorkPatch(state: ChatWorkState, revision: number, patch: HermesV2WorkPatch): ChatWorkState {
  if (state.revision !== null && revision < state.revision) return state;
  let next = { ...state, revision };
  if (patch.kind === "subagent") {
    const previous = state.subagents.find((row) => row.id === patch.id) ?? emptySubagent(patch.id);
    const row = mergeDefined(previous, patch);
    next = { ...next, subagents: [...state.subagents.filter((entry) => entry.id !== row.id), row] };
  } else if (patch.kind === "delegation") {
    const previous = state.delegations.find((row) => row.delegationId === patch.delegationId && row.taskIndex === patch.taskIndex)
      ?? emptyDelegation(patch.delegationId, patch.taskIndex);
    const row = mergeDefined(previous, patch);
    next = { ...next, delegations: [...state.delegations.filter((entry) => entry.delegationId !== row.delegationId || entry.taskIndex !== row.taskIndex), row] };
  } else {
    const previous = state.tasks.find((row) => row.kind === patch.kind && row.id === patch.id);
    // Ein Feldpatch ohne Status belegt keinen unbekannten laufenden Start.
    if (!previous && patch.status === undefined) return next;
    const row = mergeDefined<HermesV2WorkTask>(previous ?? { kind: patch.kind, id: patch.id, text: null, status: patch.status! }, patch);
    if (previous?.status === "completed") row.status = "completed";
    next = { ...next, tasks: [...state.tasks.filter((entry) => entry.kind !== row.kind || entry.id !== row.id), row] };
  }
  return boundWork(next);
}
/** Die Startquittung beweist einen eigenen Task; ein früherer Abschluss gewinnt. */
export function acceptedWorkTask(state: ChatWorkState, kind: "background" | "btw", id: string,
  settlement: "running" | "completed" | "unknown" = "running"): ChatWorkState {
  const previous = state.tasks.find((row) => row.kind === kind && row.id === id);
  if (previous?.status === "completed") return state;
  if (settlement === "unknown") return { ...state, loaded: false };
  if (previous) return settlement === "running" ? state : { ...state,
    tasks: state.tasks.map((row) => row === previous ? { ...row, status: "completed" } : row) };
  const task: HermesV2WorkTask = { kind, id, status: settlement, text: null };
  return boundWork({ ...state, tasks: [...state.tasks, task] });
}
export function workTree(rows: readonly HermesV2WorkSubagent[]): ChatWorkSubagentView[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const projected = rows.map((row): ChatWorkSubagentView => {
    let current = row, depth = 0, flat = row.depth === null && row.parentId === null;
    const visited = new Set([row.id]);
    while (current.parentId !== null) {
      const parent = byId.get(current.parentId);
      if (!parent || visited.has(parent.id)) { flat = true; break; }
      visited.add(parent.id); depth++; current = parent;
    }
    return { ...row, key: workKey("subagent", row.id), flat, treeDepth: flat ? 0 : depth,
      parentKey: !flat && row.parentId ? workKey("subagent", row.parentId) : null };
  });
  const ordered: ChatWorkSubagentView[] = [];
  const visit = (parentKey: string | null) => {
    for (const row of projected) if (row.parentKey === parentKey) { ordered.push(row); visit(row.key); }
  };
  visit(null);
  return ordered;
}
