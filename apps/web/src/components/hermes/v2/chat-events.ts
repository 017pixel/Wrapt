import type { HermesV2Event } from "@wrapt/contracts/hermes-v2";
import { chatPolicy } from "./chat-policy";
import { liveMessage } from "./chat-messages";
import { presentSession, type ChatSessionState } from "./chat-state";
import type { ChatMessageView, ChatToolView } from "./chat-types";
import { sameSelection } from "./chat-composer-state";
import { applyWorkPatch } from "./chat-work-state";

function turnFor(state: ChatSessionState, id: string): ChatSessionState {
  if (state.turn?.id === id) return state;
  if (state.turn?.placeholder) {
    const previousId = state.turn.id;
    return { ...state, turn: { ...state.turn, id, placeholder: false },
      live: state.live.map((message) => ({ ...message, tools: message.tools.map((tool) => tool.turnId === previousId ? { ...tool, turnId: id } : tool) })) };
  }
  return { ...state, turn: { id, placeholder: false, assistantId: null, segment: 0, closed: false } };
}
function assistant(state: ChatSessionState): ChatSessionState {
  if (state.turn?.assistantId) return state;
  const turn = state.turn ?? { id: `generation:${state.generation}`, placeholder: true, assistantId: null, segment: 0, closed: false };
  const message = liveMessage(`live:${state.generation}:${turn.id}:assistant:${turn.segment}`, "assistant");
  return { ...state, live: [...state.live, message], turn: { ...turn, assistantId: message.id, segment: turn.segment + 1 } };
}
function updateMessage(state: ChatSessionState, id: string, update: (message: ChatMessageView) => ChatMessageView): ChatSessionState {
  return { ...state, live: state.live.map((message) => message.id === id ? update(message) : message) };
}
function toolEvent(state: ChatSessionState, event: Extract<HermesV2Event, { type: "tool.started" | "tool.completed" }>): ChatSessionState {
  const turnId = state.turn?.id ?? `generation:${state.generation}`;
  const occurrences = state.live.flatMap((message) => message.tools).filter((tool) => tool.toolId === event.payload.toolId && tool.turnId === turnId);
  const latest = occurrences.at(-1);
  const existing = event.type === "tool.started" && latest?.status === "complete" ? undefined : latest;
  const base: ChatToolView = existing ?? { id: `live:${state.generation}:${turnId}:tool:${event.payload.toolId}:${occurrences.length}`, toolId: event.payload.toolId,
    turnId, name: event.payload.name, status: "unknown", outcome: "unknown", input: null, output: null, durationMs: null };
  const tool: ChatToolView = event.type === "tool.started"
    ? { ...base, name: event.payload.name, status: "running", input: event.payload.input }
    : { ...base, status: "complete", output: event.payload.output, durationMs: event.payload.durationMs,
      outcome: event.payload.error === null ? "unknown" : event.payload.error ? "error" : "success" };
  if (existing) {
    state = { ...state, live: state.live.map((message) => ({ ...message, tools: message.tools.map((entry) => entry.id === tool.id ? tool : entry) })) };
  } else {
    if (state.turn?.assistantId) {
      state = updateMessage(state, state.turn.assistantId, (message) => ({ ...message, status: "interim" }));
      state = { ...state, turn: { ...state.turn!, assistantId: null } };
    }
    state = assistant(state);
    state = updateMessage(state, state.turn!.assistantId!, (message) => ({ ...message, tools: [...message.tools, tool] }));
  }
  if (event.type === "tool.completed") {
    if (state.turn?.assistantId) state = updateMessage(state, state.turn.assistantId, (message) => ({ ...message, status: "interim" }));
    state = { ...state, turn: { ...state.turn!, assistantId: null } };
  }
  return state;
}
export function applyChatEvent(previous: ChatSessionState, event: HermesV2Event): ChatSessionState {
  if (event.sessionId !== previous.sessionId || (previous.epoch !== null && event.epoch !== previous.epoch)) return previous;
  if (event.seq !== null && event.seq <= previous.cursor) return previous;
  let state = { ...previous, cursor: event.seq ?? previous.cursor };
  if (event.type === "message.started") {
    state = turnFor(state, event.payload.turnId);
    state = { ...state, running: true };
  } else if (event.type === "message.delta" || event.type === "reasoning.delta" || event.type === "message.interim" || event.type === "message.completed") {
    state = turnFor(state, event.payload.turnId);
    if (state.turn?.closed) return presentSession(state);
    state = assistant(state);
    const id = state.turn!.assistantId!;
    if (event.type === "message.delta") state = updateMessage(state, id, (message) => {
      const text = message.text + event.payload.text;
      return { ...message, text: text.slice(0, chatPolicy.textLimit),
        error: text.length > chatPolicy.textLimit ? "Die Anzeige dieser Nachricht wurde gekürzt." : message.error };
    });
    if (event.type === "reasoning.delta") state = updateMessage(state, id, (message) => {
      const reasoning = (message.reasoning ?? "") + event.payload.text;
      return { ...message, reasoning: reasoning.slice(0, chatPolicy.textLimit),
        error: reasoning.length > chatPolicy.textLimit ? "Die Anzeige des Reasonings wurde gekürzt." : message.error };
    });
    if (event.type === "message.interim") {
      state = updateMessage(state, id, (message) => ({ ...message,
        text: event.payload.alreadyStreamed && message.text ? message.text : event.payload.text, status: "interim" }));
      state = { ...state, turn: { ...state.turn!, assistantId: null } };
    }
    if (event.type === "message.completed") {
      state = updateMessage(state, id, (message) => ({ ...message, text: event.payload.text,
        reasoning: event.payload.reasoning ?? message.reasoning, status: "complete", error: event.payload.error,
        readEvidence: event.payload.readEvidence ?? null, readOffset: 0 }));
      const persisted = event.payload.persistedTurn;
      if (persisted?.complete) {
        if (persisted.assistantRowId) state = updateMessage(state, id, (message) => ({ ...message, id: `row:${persisted.assistantRowId}`, rowId: persisted.assistantRowId }));
      }
      state = { ...state, running: false, generatingTool: null, usage: event.payload.usage, turn: { ...state.turn!, closed: true } };
    }
  } else if (event.type === "tool.started" || event.type === "tool.completed") state = toolEvent({ ...state, generatingTool: null }, event);
  else if (event.type === "tool.generating") state = { ...state, generatingTool: event.payload.name };
  else if (event.type === "session.updated") {
    const cwdChanged = (state.session?.cwd ?? null) !== event.payload.session.cwd;
    state = { ...state, session: event.payload.session, running: event.payload.session.running,
      turnStartedAt: event.payload.turnStartedAt, selection: event.payload.selection, selectionRevision: state.selectionRevision + 1,
      modelRevision: state.modelRevision + (sameSelection(state.selection, event.payload.selection) ? 0 : 1),
      cwdRevision: state.cwdRevision + (cwdChanged ? 1 : 0), composer: event.payload.composer ?? null,
      work: cwdChanged ? { ...state.work, loaded: false, loading: false, queueObserved: false } : state.work };
  }
  else if (event.type === "request.opened") state = { ...state, requests: [...state.requests.filter((entry) => entry.key !== event.payload.key), event.payload] };
  else if (event.type === "request.closed") state = { ...state, requests: state.requests.filter((entry) => entry.key !== event.payload.requestKey) };
  else if (event.type === "subagent.updated") state = { ...state, subagents: [...state.subagents.filter((entry) => entry.id !== event.payload.id), event.payload] };
  else if (event.type === "background.completed") state = { ...state, background: state.background.map((entry) => entry.id === event.payload.taskId
    ? { ...entry, status: "complete", output: event.payload.text } : entry) };
  else if (event.type === "work.updated") state = { ...state, work: applyWorkPatch(state.work, event.payload.revision, event.payload.change) };
  else if (event.type === "work.invalidated" && (state.work.revision === null || event.payload.revision >= state.work.revision)) state = { ...state,
    work: { ...state.work, revision: event.payload.revision, loaded: false, ...(event.payload.reason === "queue" ? { queueObserved: false } : {}) } };
  else if (event.type === "session.error") state = { ...state, error: { code: event.payload.code, message: event.payload.message,
    outcome: "not_sent", readEvidence: event.payload.readEvidence ?? null } };
  return presentSession(state);
}
