import { resolveShortcuts } from "../../config/shortcuts";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useNavigationRegistry } from "../../extensions/useNavigationRegistry";
import { useAppPreferences } from "../../stores/appPreferences";
import { useSidebarPreferences } from "../../stores/sidebarPreferences";
import { navigationTargets } from "./navigationTargets";
import { createShortcutController } from "./shortcutController";
import { shortcutEvents } from "./shortcutEvents";
import { useShortcutState } from "./shortcutState";
import "./shortcuts.css";

/** Nur kontrollierte, sichtbare Werkzeug-Frames dürfen Tastaturereignisse melden. */
function trustedFrame(source: Window): boolean {
  return Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe")).some((frame) => {
    if (frame.contentWindow !== source || frame.closest('[inert], [aria-hidden="true"]') || !frame.getClientRects().length) return false;
    const url = new URL(frame.src, window.location.href);
    return url.origin === window.location.origin && /^\/(t3|editor|hermes|opencode)(\/|$)/.test(url.pathname);
  });
}

export function WorkbenchShortcuts() {
  const navigate = useNavigate();
  const navigation = useNavigationRegistry();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => {
    const targets = () => {
      const state = useSidebarPreferences.getState();
      return navigationTargets(navigation, state.hiddenPages, state.navigationOrder);
    };
    const openRoute = (path: string) => {
      useShortcutState.setState({ showingNumbers: false });
      navigateRef.current(path);
      return true;
    };
    const controller = createShortcutController({
      preferences: () => resolveShortcuts(useAppPreferences.getState().shortcuts),
      recording: () => useShortcutState.getState().recording,
      numbersAllowed: () => !Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"]'))
        .some((element) => !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length > 0),
      showNumbers: (showingNumbers) => {
        if (useShortcutState.getState().showingNumbers !== showingNumbers) useShortcutState.setState({ showingNumbers });
      },
      navigateNumber: (index) => {
        const target = targets()[index];
        return target ? openRoute(target.value.route.path) : false;
      },
      execute: (action) => {
        if (action === "server" || action === "limits") {
          const event = new Event(shortcutEvents[action], { cancelable: true });
          window.dispatchEvent(event);
          return event.defaultPrevented;
        }
        const key = action === "usage" ? "usage" : action;
        const target = useSidebarPreferences.getState().isPageVisible(key)
          ? navigation.items.find((item) => item.value.runtime.legacyVisibilityKey === key) : undefined;
        return target ? openRoute(target.value.route.path) : false;
      },
    });
    const receive = (event: KeyboardEvent) => {
      if (controller.handle(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const frameEvent = (message: Event) => {
      const detail = (message as CustomEvent<{ source: Window; event?: KeyboardEvent; reset?: boolean }>).detail;
      if (!detail || !trustedFrame(detail.source)) return;
      if (detail.reset) controller.reset();
      else if (detail.event) receive(detail.event);
    };
    const reset = () => controller.reset();
    const visibility = () => { if (document.hidden) reset(); };
    for (const type of ["keydown", "keyup", "keypress"]) window.addEventListener(type, receive as EventListener, true);
    window.addEventListener(shortcutEvents.frame, frameEvent);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    const unsubscribe = useAppPreferences.subscribe(reset);
    return () => {
      for (const type of ["keydown", "keyup", "keypress"]) window.removeEventListener(type, receive as EventListener, true);
      window.removeEventListener(shortcutEvents.frame, frameEvent);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe();
      reset();
    };
  }, [navigation]);
  return null;
}
