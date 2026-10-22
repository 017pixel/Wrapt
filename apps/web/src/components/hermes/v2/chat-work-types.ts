import type { HermesV2WorkSubagent, HermesV2WorkDelegation, HermesV2WorkProcess,
  HermesV2WorkTask, HermesV2WorkRoster } from "@wrapt/contracts/hermes-v2";
import type { ChatErrorInfo } from "./chat-types";

export interface ChatWorkSubagentView extends HermesV2WorkSubagent {
  key: string; parentKey: string | null; treeDepth: number; flat: boolean;
}
export type ChatWorkAction = "subagent.interrupt" | "subagent.tail" | "process.kill" | "background" | "btw" | "steer" | "queue";
export type ChatWorkResult =
  | { kind: "subagent.interrupt"; id: string; found: boolean }
  | { kind: "subagent.tail"; id: string; available: boolean; text: string; truncated: boolean }
  | { kind: "process.kill"; id: string; status: "killed" | "already_exited" | "not_found" | "error"; exitCode: number | null; output: string; error: string | null }
  | { kind: "background" | "btw"; taskId: string }
  | { kind: "steer"; status: "queued" | "redirected" | "rejected" }
  | { kind: "queue"; status: "streaming" | "queued" | "steered" | "redirected"; userRowId: number | null };
export interface ChatWorkActionView {
  key: string; action: ChatWorkAction; targetId: string | null; text: string | null;
  status: "pending" | "confirmed" | "unknown" | "not_sent";
  result: ChatWorkResult | null; error: ChatErrorInfo | null;
}
export interface ChatWorkView {
  available: boolean; loading: boolean; error: ChatErrorInfo | null; revision: number | null;
  coverage: HermesV2WorkRoster["coverage"] | null;
  subagents: readonly ChatWorkSubagentView[];
  delegations: readonly (HermesV2WorkDelegation & { key: string })[];
  processes: readonly (HermesV2WorkProcess & { key: string })[];
  tasks: readonly (HermesV2WorkTask & { key: string })[];
  counts: { subagents: number | null; processes: number | null; tasks: number | null };
  queue: { head: string | null; observed: boolean };
  actions: readonly ChatWorkActionView[];
}
export const emptyChatWork: ChatWorkView = { available: false, loading: false, error: null, revision: null, coverage: null,
  subagents: [], delegations: [], processes: [], tasks: [], counts: { subagents: null, processes: null, tasks: null },
  queue: { head: null, observed: false }, actions: [] };
