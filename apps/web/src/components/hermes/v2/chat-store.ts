import type { ChatSessionsView } from "./chat-types";
import { emptyChatSession, type ChatSessionState } from "./chat-state";
import { chatPolicy } from "./chat-policy";

export const emptySessions: ChatSessionsView = { items: [], loading: false, hasMore: false, error: null };
export class ChatStore {
  private sessions = new Map<string, ChatSessionState>();
  private listeners = new Map<string, Set<() => void>>();
  private listListeners = new Set<() => void>();
  private list: ChatSessionsView = emptySessions;
  getList = (): ChatSessionsView => this.list;
  subscribeList = (listener: () => void): (() => void) => {
    this.listListeners.add(listener);
    return () => { this.listListeners.delete(listener); };
  };
  setList(list: ChatSessionsView): void {
    this.list = list;
    for (const listener of this.listListeners) listener();
  }
  get(id: string): ChatSessionState {
    let state = this.sessions.get(id);
    if (!state) { state = emptyChatSession(id); this.sessions.set(id, state); }
    return state;
  }
  peek(id: string): ChatSessionState | null { return this.sessions.get(id) ?? null; }
  subscribe(id: string, listener: () => void): () => void {
    let listeners = this.listeners.get(id);
    if (!listeners) { listeners = new Set(); this.listeners.set(id, listeners); }
    listeners.add(listener);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(id); };
  }
  set(id: string, state: ChatSessionState): void {
    if (this.sessions.get(id) === state) return;
    this.sessions.set(id, state);
    for (const listener of this.listeners.get(id) ?? []) listener();
  }
  update(id: string, update: (state: ChatSessionState) => ChatSessionState): void {
    this.set(id, update(this.get(id)));
  }
  forgetDeletedSessions(ids: ReadonlySet<string>): void {
    for (const id of ids) {
      this.sessions.delete(id);
      for (const listener of this.listeners.get(id) ?? []) listener();
    }
    this.setList({ ...this.list, items: this.list.items.filter((item) => !ids.has(item.id)) });
  }
  evictUnleased(leased: ReadonlySet<string>): void {
    for (const id of this.sessions.keys()) {
      if (this.sessions.size <= chatPolicy.maxSessions) break;
      if (!leased.has(id) && !this.listeners.get(id)?.size) this.sessions.delete(id);
    }
  }
  clear(): void {
    const ids = [...this.sessions.keys()];
    this.sessions.clear();
    for (const id of ids) for (const listener of this.listeners.get(id) ?? []) listener();
    this.setList(emptySessions);
  }
}
