import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAppPreferences } from "../../../stores/appPreferences";
import { useRouteActivity } from "../../../lib/routeActivity";
import { getChatRuntime } from "./chat-runtime";
import { emptyOwner } from "./chat-owners";
import { emptySessions } from "./chat-store";
import type { ChatConnectionView, HermesV2Chat, HermesV2ChatOptions } from "./chat-types";

const idleConnection: ChatConnectionView = { state: "idle", attempt: 0, error: null };
const noopSubscribe = () => () => {};
const readVisibility = () => typeof document === "undefined" || document.visibilityState !== "hidden";
const subscribeVisibility = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};

/** Owner-Auswahl kommt von Route/Panel; der Hook hält weder globale aktive ID noch Persistenz. */
export function useHermesV2Chat(options: HermesV2ChatOptions): HermesV2Chat {
  const enabled = useAppPreferences((state) => state.hermesV2Enabled);
  const routeActive = useRouteActivity();
  const documentVisible = useSyncExternalStore(enabled ? subscribeVisibility : noopSubscribe, readVisibility, () => true);
  const effective = { ...options, active: options.active ?? routeActive, visible: (options.visible ?? true) && documentVisible };
  const optionsRef = useRef(effective);
  useEffect(() => { optionsRef.current = effective; });
  const runtime = useMemo(() => getChatRuntime(), []);
  const actions = useMemo(() => runtime.actionsFor(options.ownerId), [runtime, options.ownerId]);
  const subscribeOwner = useCallback((listener: () => void) => runtime.owners.subscribe(options.ownerId, listener), [runtime, options.ownerId]);
  const getOwner = useCallback(() => enabled ? runtime.owners.getView(options.ownerId) : emptyOwner, [runtime, options.ownerId, enabled]);
  const owner = useSyncExternalStore(enabled ? subscribeOwner : noopSubscribe, getOwner, () => emptyOwner);
  const connection = useSyncExternalStore(enabled ? runtime.client.subscribe : noopSubscribe,
    enabled ? runtime.client.getSnapshot : () => idleConnection, () => idleConnection);
  const sessions = useSyncExternalStore(enabled ? runtime.store.subscribeList : noopSubscribe,
    enabled ? runtime.store.getList : () => emptySessions, () => emptySessions);
  const selectedId = owner.sessionId;
  const subscribeSession = useCallback((listener: () => void) => selectedId && enabled
    ? runtime.store.subscribe(selectedId, listener) : () => {}, [runtime, selectedId, enabled]);
  const getSession = useCallback(() => selectedId && enabled && runtime.enabled() ? runtime.store.get(selectedId) : null, [runtime, selectedId, enabled]);
  const activeSnapshot = useSyncExternalStore(subscribeSession, getSession, () => null);
  useEffect(() => {
    if (!enabled) { runtime.dispose("v2-disabled"); return; }
    return runtime.acquire(optionsRef.current);
  }, [runtime, options.ownerId, enabled]);
  useEffect(() => {
    if (enabled) runtime.update(optionsRef.current);
  }, [runtime, options.sessionId, options.active, options.visible, options.onSelectSession, routeActive, documentVisible, enabled]);
  return { ...actions, setApprovalMode: actions.setApprovalMode, connection, sessions, activeSnapshot, draft: owner.draft,
    submitting: owner.submitting, actionError: owner.actionError, unknownSend: owner.unknownSend, requestStates: owner.requestStates, composer: owner.composer, work: owner.work };
}
