import type { ChatRuntime } from "./chat-runtime";
import type { OwnerCapture } from "./chat-owners";
import { ChatError } from "./gateway-protocol";

/** Jeder Schreibklick muss bereits beim Aufruf handlungsfähig sein. */
export function composerReady(runtime: ChatRuntime, capture: OwnerCapture, capability = true, idle = false) {
  runtime.owners.assert(capture);
  const state = capture.sessionId ? runtime.store.peek(capture.sessionId) : null;
  if (!runtime.enabled() || capture.owner.options.active === false || capture.owner.options.visible === false
    || (typeof document !== "undefined" && document.visibilityState === "hidden")) throw new ChatError("OWNER_HIDDEN", "Diese Hermes-Fläche ist nicht sichtbar.");
  if (!state || state.loading || !state.writable || !runtime.sessionIsSynced(capture.sessionId!)
    || runtime.client.getSnapshot().state !== "online" || (idle && state.running !== false)) throw new ChatError("SESSION_UNAVAILABLE", "Die Sitzung ist für diese Aktion nicht bereit.");
  if (capability && !runtime.client.getComposerBinding()) throw new ChatError("COMPOSER_UNAVAILABLE", "Der Gateway hat diese Composerfunktion nicht bestätigt.");
  return state;
}
