import type { HermesV2Attachment, HermesV2Message, HermesV2Snapshot } from "@wrapt/contracts/hermes-v2";
import type { ChatMessageView, ChatSessionView } from "./chat-types";
import { chatPolicy } from "./chat-policy";
import { boundMessages, historyMessage, liveMessage, mergeMessages, olderHistory, sameMessage, snapshotHistory } from "./chat-messages";
import { sameSelection } from "./chat-composer-state";
import { emptyWorkState, type ChatWorkState } from "./chat-work-state";

export interface ChatTurn {
  id: string;
  placeholder: boolean;
  assistantId: string | null;
  segment: number;
  closed: boolean;
}
export interface ChatSessionState extends ChatSessionView {
  work: ChatWorkState;
  /** Jeder beobachtete CWD-Wechsel entwertet auch spätere A→B→A-Fortsetzungen. */
  cwdRevision: number;
  selectionRevision: number;
  /** Tatsächlicher Modellkontext, unabhängig von gleichlautenden Info-Beobachtungen. */
  modelRevision: number;
  history: readonly ChatMessageView[];
  live: readonly ChatMessageView[];
  turn: ChatTurn | null;
  historyOffset: number;
  historyPrimed: boolean;
}
export function emptyChatSession(sessionId: string): ChatSessionState {
  return {
    sessionId, session: null, epoch: null, cursor: 0, generation: 0, selectionRevision: 0, modelRevision: 0, cwdRevision: 0, loading: true, error: null,
    messages: [], tools: [], requests: [], generatingTool: null, running: null, turnStartedAt: null, writable: false,
    blockedReason: null, queuedText: null, selection: null, reasoningEffort: null, usage: null,
    subagents: [], background: [], work: emptyWorkState(), hasOlder: false, loadingOlder: false,
    catalog: { commands: [], models: null, loading: false, error: null },
    history: [], live: [], turn: null, historyOffset: 0, historyPrimed: false,
  };
}
export function presentSession(state: ChatSessionState): ChatSessionState {
  const merged = mergeMessages(state.history, state.live);
  const messages = boundMessages(merged);
  const retained = new Set(messages);
  const limited = messages.length < merged.length;
  return { ...state, history: state.history.filter((message) => retained.has(message)),
    live: state.live.filter((message) => retained.has(message)),
    ...(limited ? { hasOlder: false, error: { code: "HISTORY_LIMIT", message: "Die Chat-Anzeige hat ihre Speichergrenze erreicht.", outcome: "not_sent" as const } } : {}),
    messages, tools: messages.flatMap((message) => message.tools) };
}
export function applyChatSnapshot(state: ChatSessionState, snapshot: HermesV2Snapshot): ChatSessionState {
  const generation = state.generation + 1;
  const incoming = snapshot.messages.map((message) => historyMessage(message));
  const history = snapshotHistory(state.history, incoming).slice(-chatPolicy.maxMessages);
  const live: ChatMessageView[] = [];
  let turn: ChatTurn | null = null;
  if (snapshot.inflight) {
    const prefix = `live:snapshot:${generation}`;
    // Die Snapshot-History ist für User-Rows maßgeblich. Ohne Row-Zeuge erzeugen
    // wir neben vorhandener User-History keine zweite geraten identische Zeile.
    const userId = incoming.some((message) => message.role === "user") ? null : `${prefix}:user`;
    if (userId && snapshot.inflight.user) live.push(liveMessage(userId, "user", snapshot.inflight.user));
    const assistant = liveMessage(`${prefix}:assistant`, "assistant", snapshot.inflight.displayText ?? snapshot.inflight.assistant);
    live.push({ ...assistant, error: snapshot.inflight.error });
    turn = { id: prefix, placeholder: true, assistantId: assistant.id, segment: 0, closed: false };
  }
  return presentSession({ ...state, session: snapshot.session, epoch: snapshot.epoch, cursor: snapshot.cursor,
    generation, loading: false, error: null, history, live, turn, running: snapshot.running,
    turnStartedAt: snapshot.turnStartedAt, writable: snapshot.writable, blockedReason: snapshot.blockedReason,
    queuedText: snapshot.queuedText, selection: snapshot.selection, selectionRevision: state.selectionRevision + 1,
    modelRevision: state.modelRevision + (sameSelection(state.selection, snapshot.selection) ? 0 : 1),
    reasoningEffort: snapshot.reasoningEffort, composer: snapshot.composer ?? null,
    requests: snapshot.requests, generatingTool: null, usage: null, subagents: [], background: [], work: emptyWorkState(snapshot.queuedText, true),
    historyOffset: 0, historyPrimed: false, hasOlder: snapshot.hasOlder === true, loadingOlder: false,
  });
}
export function applyChatHistory(state: ChatSessionState, messages: readonly HermesV2Message[], offset: number, returned: number, hasMore: boolean): ChatSessionState {
  const incoming = messages.map((message) => historyMessage(message, offset));
  const merged = offset === 0 ? snapshotHistory(state.history, incoming) : olderHistory(state.history, incoming);
  const full = merged.length > chatPolicy.maxMessages;
  return presentSession({ ...state, history: merged.slice(-chatPolicy.maxMessages),
    live: state.live.filter((message) => !incoming.some((entry) => sameMessage(entry, message))), loadingOlder: false,
    historyOffset: offset + returned, historyPrimed: true, hasOlder: hasMore && !full,
    error: full ? { code: "HISTORY_LIMIT", message: "Die Anzeige ist auf 4000 Nachrichten begrenzt.", outcome: "not_sent" } : state.error,
  });
}
export function optimisticUser(state: ChatSessionState, id: string, text: string): ChatSessionState {
  const user = liveMessage(`live:user:${id}`, "user", text);
  // Ein unkorrelierter nächster Turn kann aus Classic oder einem anderen Owner kommen.
  return presentSession({ ...state, live: [...state.live, user] });
}
export function removeOptimisticUser(state: ChatSessionState, id: string): ChatSessionState {
  const userId = `live:user:${id}`;
  return presentSession({ ...state, live: state.live.filter((message) => message.id !== userId) });
}
/** Ein Submit-Receipt beweist ausschließlich diese eine gesendete Userrow. */
export function applySubmitReceipt(state: ChatSessionState, optimisticId: string, rowId: number, attachments: readonly HermesV2Attachment[] = []): ChatSessionState {
  const id = `live:user:${optimisticId}`;
  const original = state.live.find((message) => message.id === id && message.role === "user");
  if (!original && !attachments.length) return state;
  const stored = state.history.find((message) => message.rowId === rowId && message.role === "user");
  const promoted = original ? { ...original, id: `row:${rowId}`, rowId, ...(attachments.length ? { attachments } : {}) } : null;
  const withAttachments = (message: ChatMessageView) => message.role === "user" && message.rowId === rowId && attachments.length
    ? { ...message, attachments: [...new Map([...(message.attachments ?? []), ...attachments].map((attachment) => [attachment.id, attachment])).values()] } : message;
  return presentSession({ ...state,
    history: state.history.map(withAttachments),
    live: (stored ? state.live.filter((message) => message !== original)
      : state.live.map((message) => message === original && promoted ? promoted : message)).map(withAttachments),
  });
}
