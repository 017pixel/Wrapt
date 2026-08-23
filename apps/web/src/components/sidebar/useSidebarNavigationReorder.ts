import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

interface NavigationReorderOptions {
  enabled: boolean;
  itemId: string;
  availableIds: readonly string[];
  moveBefore: (dragId: string, targetId: string, availableIds: string[]) => void;
}

export function useSidebarNavigationReorder({ enabled, itemId, availableIds, moveBefore }: NavigationReorderOptions) {
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);
  const [active, setActive] = useState(false);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => () => clearTimer(), []);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || event.pointerType === "mouse") return;
    clearTimer();
    originRef.current = { x: event.clientX, y: event.clientY };
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    timerRef.current = window.setTimeout(() => {
      activeRef.current = true;
      setActive(true);
      target.setPointerCapture?.(pointerId);
    }, 380);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!activeRef.current) {
      if (Math.hypot(event.clientX - originRef.current.x, event.clientY - originRef.current.y) > 8) clearTimer();
      return;
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-navigation-id]");
    const targetId = target?.dataset.navigationId;
    if (targetId && targetId !== itemId) moveBefore(itemId, targetId, [...availableIds]);
  };

  const finish = () => {
    clearTimer();
    if (activeRef.current) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    activeRef.current = false;
    setActive(false);
  };

  return {
    active,
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
    suppressContextMenu: () => activeRef.current,
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (!suppressClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
