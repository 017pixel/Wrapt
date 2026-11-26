import { useCallback, useEffect, useRef } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPAND_THRESHOLD,
  SIDEBAR_KEYBOARD_STEP,
  SIDEBAR_KEYBOARD_STEP_LARGE,
  clampSidebarWidth,
  resolveSidebarKeyboardResize,
  resolveSidebarPointerRelease,
  sidebarLiveWidth,
  sidebarModeClassNames,
  type SidebarLayoutState,
} from "../../lib/sidebarSizing";

interface SidebarResizeOptions {
  collapsed: boolean;
  width: number;
  maxWidth: number;
  shellRef: RefObject<HTMLDivElement | null>;
  onCommit: (layout: SidebarLayoutState) => void;
}

const MODE_CLASSES = ["is-collapsed", "is-compact", "is-narrow"] as const;

function applyModeClasses(shell: HTMLDivElement, collapsed: boolean, width: number): void {
  const active = new Set(sidebarModeClassNames(collapsed, width).split(" ").filter(Boolean));
  for (const name of MODE_CLASSES) shell.classList.toggle(name, active.has(name));
  // Der Workspace-Umschalter bekommt seine Kompaktform über eine Prop-Klasse,
  // die während des Ziehens nicht neu rendert. Deshalb schalten wir sie am
  // Element mit um, damit der Vorschau-Modus sofort stimmt.
  shell.querySelector<HTMLElement>(".workspace-switcher-trigger")
    ?.classList.toggle("is-compact", active.has("is-compact"));
}

function applyWidth(shell: HTMLDivElement, width: number): void {
  shell.style.setProperty("--sidebar-width", `${width}px`);
}

/**
 * Ziehen am rechten Rand. Die Breite läuft während der Geste direkt als
 * CSS-Variable am Element, damit die Navigationsliste nicht bei jedem Pixel
 * neu rendert. Erst beim Loslassen wandert der gerastete Endwert in den State.
 */
export function useSidebarResize({ collapsed, width, maxWidth, shellRef, onCommit }: SidebarResizeOptions) {
  const stopDragRef = useRef<(() => void) | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => () => stopDragRef.current?.(), []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    stopDragRef.current?.();

    const shell = shellRef.current;
    if (!shell) return;
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;
    let lastClientX = startX;
    let frame: number | null = null;
    let stopped = false;

    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    const preventContextMenu = (menuEvent: Event) => menuEvent.preventDefault();
    const applyLive = () => {
      const liveWidth = sidebarLiveWidth(startWidth, lastClientX - startX, maxWidth);
      const liveCollapsed = collapsed && liveWidth < SIDEBAR_EXPAND_THRESHOLD;
      // Die Breite folgt immer dem Zeiger, auch unterhalb der Öffnungsschwelle.
      // Nur die Darstellung bleibt bis 180 px im kompakten Modus.
      applyWidth(shell, liveWidth);
      applyModeClasses(shell, liveCollapsed, liveCollapsed ? SIDEBAR_COLLAPSED_WIDTH : liveWidth);
    };

    shell.classList.add("is-resizing");
    body.style.cursor = "col-resize";
    body.style.userSelect = "none";
    document.addEventListener("contextmenu", preventContextMenu, true);
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Ohne Capture funktionieren die Fenster-Listener weiterhin.
    }

    const flush = () => {
      if (frame === null) return;
      window.cancelAnimationFrame(frame);
      frame = null;
      applyLive();
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        applyLive();
      });
    };
    const finish = (commit: boolean) => {
      if (stopped) return;
      stopped = true;
      stopDragRef.current = null;
      flush();
      const moved = Math.abs(lastClientX - startX) >= 3;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", lostCapture);
      document.removeEventListener("contextmenu", preventContextMenu, true);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      try {
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {
        // Das Element kann während der Geste aus dem DOM geflogen sein.
      }
      shell.classList.remove("is-resizing");
      if (!commit || !moved) {
        applyWidth(shell, collapsed ? SIDEBAR_COLLAPSED_WIDTH : width);
        applyModeClasses(shell, collapsed, width);
        return;
      }
      const finalWidth = sidebarLiveWidth(startWidth, lastClientX - startX, maxWidth);
      const layout = resolveSidebarPointerRelease({
        liveWidth: finalWidth,
        wasCollapsed: collapsed,
        lastExpandedWidth: width,
        maximum: maxWidth,
      });
      applyWidth(shell, layout.collapsed ? SIDEBAR_COLLAPSED_WIDTH : layout.width);
      applyModeClasses(shell, layout.collapsed, layout.width);
      commitRef.current(layout);
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      lastClientX = moveEvent.clientX;
      schedule();
    };
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      lastClientX = upEvent.clientX;
      finish(true);
    };
    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      finish(false);
    };
    const lostCapture = (lostEvent: PointerEvent) => {
      if (lostEvent.pointerId !== pointerId) return;
      finish(false);
    };

    stopDragRef.current = () => finish(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", lostCapture);
  }, [collapsed, maxWidth, shellRef, width]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const step = event.shiftKey ? SIDEBAR_KEYBOARD_STEP_LARGE : SIDEBAR_KEYBOARD_STEP;
    const result = resolveSidebarKeyboardResize({
      collapsed,
      width,
      delta: event.key === "ArrowRight" ? step : -step,
      maximum: maxWidth,
    });
    if (!result) return;
    event.preventDefault();
    if (result.type === "collapse") {
      commitRef.current({ collapsed: true, width: clampSidebarWidth(width) });
      return;
    }
    commitRef.current({ collapsed: false, width: result.width });
  }, [collapsed, maxWidth, width]);

  return { onPointerDown, onKeyDown };
}
