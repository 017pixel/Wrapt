import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAppPreferences } from "../../../stores/appPreferences";
import { useRouteActivity } from "../../../lib/routeActivity";
import { getOrganizationRuntime } from "./organization-runtime";
import { emptySidebar } from "./sidebar-empty";
import type { HermesV2Sidebar, HermesV2SidebarOptions } from "./sidebar-types";

const noSubscription = () => () => {};
const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
const observeVisibility = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};
export function useHermesV2Sidebar(options: HermesV2SidebarOptions): HermesV2Sidebar {
  const enabled = useAppPreferences((state) => state.hermesV2Enabled);
  const routeActive = useRouteActivity();
  const documentVisible = useSyncExternalStore(enabled ? observeVisibility : noSubscription, visible, () => true);
  const effective = { ...options, active: options.active ?? routeActive, visible: (options.visible ?? true) && documentVisible };
  const current = useRef(effective);
  useEffect(() => { current.current = effective; });
  const runtime = useMemo(() => getOrganizationRuntime(), []);
  const subscribe = useCallback((notify: () => void) => runtime.subscribe(options.ownerId, notify), [runtime, options.ownerId]);
  const getView = useCallback(() => enabled ? runtime.getView(options.ownerId) : emptySidebar, [runtime, enabled, options.ownerId]);
  const view = useSyncExternalStore(enabled ? subscribe : noSubscription, getView, () => emptySidebar);
  useEffect(() => {
    if (!enabled) return;
    return runtime.acquire(current.current);
  }, [runtime, options.ownerId, enabled]);
  useEffect(() => { if (enabled) runtime.update(current.current); }, [runtime, enabled, options.ownerId, options.sessionId, options.active, options.visible, options.projectId, routeActive, documentVisible]);
  return view;
}
