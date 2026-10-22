// UItest-Fixtures für die Phase-7-Bildschirmteile: belegte ChatWorkView-Zeilen und Aktionen.
import type {
  ChatWorkActionView,
  ChatWorkResult,
  ChatWorkSubagentView,
  ChatWorkView,
} from "./chat-work-types";
import { emptyChatWork } from "./chat-work-types";
import type { ChatSessionView, HermesV2Chat } from "./chat-types";
import { requestChatFixture } from "./request-card-fixtures";
import type { HermesV2WorkDelegation, HermesV2WorkProcess, HermesV2WorkTask } from "@wrapt/contracts/hermes-v2";

/** Vollständige Rosterzeile mit belegten Vorgaben; Overrides erschöpfen Felder. */
export function subagentRow(overrides: Partial<ChatWorkSubagentView> = {}): ChatWorkSubagentView {
  return {
    kind: "subagent", id: "sa-1", parentId: null, depth: 0, delegationId: null,
    goal: "Unteraufgabe recherchieren", model: "cheesy/gpt", startedAt: 1730000000000,
    status: "running", toolCount: 3, lastTool: "search", acceptingSteer: true, durationMs: 42000,
    key: JSON.stringify(["subagent", "sa-1"]), parentKey: null, treeDepth: 0, flat: false,
    ...overrides,
  };
}

export function delegationRow(overrides: Partial<HermesV2WorkDelegation> = {}): HermesV2WorkDelegation & { key: string } {
  const base: HermesV2WorkDelegation = {
    kind: "delegation", delegationId: "d1", taskIndex: 0, status: "failed",
    goal: "Inhaltsprüfung", error: "Ziel war nicht erreichbar", dispatchedAt: 1730000000000, completedAt: 1730000100000,
    ...overrides,
  };
  return { ...base, key: JSON.stringify(["delegation", base.delegationId, base.taskIndex]) };
}

export function processRow(overrides: Partial<HermesV2WorkProcess> = {}): HermesV2WorkProcess & { key: string } {
  const base: HermesV2WorkProcess = {
    kind: "process", id: "p1", command: "pytest -q", status: "running", startedAt: 1730000000000,
    uptimeSeconds: 45, output: "3 tests passed", exitCode: null, ...overrides,
  };
  return { ...base, key: JSON.stringify(["process", base.id]) };
}

export function taskRow(overrides: Partial<HermesV2WorkTask> = {}): HermesV2WorkTask & { key: string } {
  const base: HermesV2WorkTask = { kind: "background", id: "t1", status: "running", text: "Bericht bauen", ...overrides };
  return { ...base, key: JSON.stringify([base.kind, base.id]) };
}

export function actionView(overrides: Partial<ChatWorkActionView> = {}): ChatWorkActionView {
  return {
    key: "a1", action: "steer", targetId: null, text: null, status: "confirmed",
    result: { kind: "steer", status: "queued" }, error: null, ...overrides,
  };
}

/** Belegte Workansicht, Basis emptyChatWork; rows/actions ausdrücklich gesetzt. */
export function workView(overrides: Partial<ChatWorkView> = {}): ChatWorkView {
  return { ...emptyChatWork, ...overrides };
}

/** Chatstub mit Workansicht; requestChatFixture liefert die übrigen Pflichtfelder.
    Alle Overrides außer snapshot und requestStates werden unverändert durchgereicht. */
export function workChat(
  work: Partial<ChatWorkView> = {},
  overrides: Omit<Partial<HermesV2Chat>, "requestStates" | "activeSnapshot">
    & { snapshot?: Partial<ChatSessionView> } = {},
): HermesV2Chat {
  const { snapshot, ...rest } = overrides;
  const baseChat = requestChatFixture({
    activeSnapshot: snapshot ? { ...surfaceSnapshot(), ...snapshot } : surfaceSnapshot(),
    ...rest,
  });
  return { ...baseChat, work: workView(work) };
}

function surfaceSnapshot(): ChatSessionView {
  return {
    sessionId: "s1",
    session: { id: "s1", title: "Sitzung", preview: "", source: "", model: "m", provider: "p", cwd: null, projectId: null, messageCount: 0, updatedAt: null, running: false, startedAt: null, draft: false },
    epoch: "e1", cursor: 0, generation: 1, loading: false, error: null, messages: [], tools: [], requests: [],
    running: false, turnStartedAt: null, writable: true, blockedReason: null, queuedText: null,
    selection: null, reasoningEffort: null, usage: null, subagents: [], background: [],
    hasOlder: false, loadingOlder: false, generatingTool: null,
    catalog: { commands: [], models: null, loading: false, error: null },
  };
}

export const tailResult = (id: string, text = "letzte Zeile"): ChatWorkResult =>
  ({ kind: "subagent.tail", id, available: true, text, truncated: false });
export const interruptResult = (id: string, found: boolean): ChatWorkResult =>
  ({ kind: "subagent.interrupt", id, found });
