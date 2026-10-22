import type { Terminal } from "@xterm/xterm";
import type { TerminalStatus } from "../terminal-types";

export interface TerminalView { terminal: Terminal; status: TerminalStatus; }
const views = new Map<string, TerminalView>();
const listeners = new Map<string, Set<(view: TerminalView | undefined) => void>>();

/** Vorschauen lesen den echten Renderer. Ein zweites Subscribe würde allen
 * Betrachtern derselben Runtime einen Snapshot aufzwingen und Scrollen stören. */
export function publishTerminalView(runtimeId: string, terminal: Terminal, status: TerminalStatus): void {
  const view = { terminal, status };
  views.set(runtimeId, view);
  for (const listener of listeners.get(runtimeId) ?? []) listener(view);
}

export function removeTerminalView(runtimeId: string, terminal: Terminal): void {
  if (views.get(runtimeId)?.terminal !== terminal) return;
  views.delete(runtimeId);
  for (const listener of listeners.get(runtimeId) ?? []) listener(undefined);
}

export function observeTerminalView(runtimeId: string, listener: (view: TerminalView | undefined) => void): () => void {
  const subscribers = listeners.get(runtimeId) ?? new Set();
  listeners.set(runtimeId, subscribers);
  subscribers.add(listener);
  listener(views.get(runtimeId));
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(runtimeId);
  };
}
