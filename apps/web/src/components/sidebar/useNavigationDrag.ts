import { useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useSidebarPreferences } from "../../stores/sidebarPreferences";

const MIME = "application/x-wrapt-navigation";
let keyboardOrder: readonly string[] | null = null;
let dragging: { id: string; originalOrder: string[]; committed: boolean } | null = null;

interface Options {
  itemId: string;
  availableIds: string[];
  enabled: boolean;
}

/** Native Maus-Geste, mit animiertem Nachrücken und unverändertem Link-Klick. */
export function useNavigationDrag({ itemId, availableIds, enabled }: Options) {
  const ref = useRef<HTMLAnchorElement>(null);
  const previousTop = useRef<number | null>(null);
  const animation = useRef<Animation | null>(null);
  const [active, setActive] = useState(false);
  const order = useSidebarPreferences((state) => state.navigationOrder);
  const move = useSidebarPreferences((state) => state.moveNavigationBefore);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const top = element.offsetTop;
    const delta = previousTop.current === null ? 0 : previousTop.current - top;
    previousTop.current = top;
    const skipAnimation = order === keyboardOrder;
    if (skipAnimation || !delta || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const currentY = new DOMMatrix(getComputedStyle(element).transform).m42;
    animation.current?.cancel();
    animation.current = element.animate([
      { transform: `translateY(${delta + currentY}px)` },
      { transform: "translateY(0)" },
    ], { duration: 180, easing: "ease-in-out" });
  }, [order]);

  useLayoutEffect(() => () => { animation.current?.cancel(); }, []);

  const onDragOver = (event: DragEvent<HTMLAnchorElement>) => {
    if (!enabled || !dragging || !availableIds.includes(dragging.id)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragging.id === itemId) return;
    const element = event.currentTarget;
    // Layout-Koordinaten bleiben auch während des Nachrückens stabil.
    const bounds = element.getBoundingClientRect();
    const transformY = new DOMMatrix(getComputedStyle(element).transform).m42;
    const after = event.clientY > bounds.top - transformY + bounds.height / 2;
    move(dragging.id, itemId, availableIds, after);
  };

  return {
    ref,
    active,
    onDragStart: (event: DragEvent<HTMLAnchorElement>) => {
      if (!enabled) { event.preventDefault(); return; }
      dragging = { id: itemId, originalOrder: [...useSidebarPreferences.getState().navigationOrder], committed: false };
      event.dataTransfer.setData(MIME, itemId);
      event.dataTransfer.effectAllowed = "move";
      setActive(true);
    },
    onDragOver,
    onDrop: (event: DragEvent<HTMLAnchorElement>) => {
      if (!enabled || !dragging || !availableIds.includes(dragging.id)) return;
      onDragOver(event);
      dragging.committed = true;
    },
    onDragEnd: () => {
      if (dragging?.id === itemId) {
        if (!dragging.committed) useSidebarPreferences.setState({ navigationOrder: dragging.originalOrder });
        dragging = null;
      }
      setActive(false);
    },
    onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => {
      if (!enabled || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const siblings = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[data-navigation-id]") ?? []);
      const index = siblings.indexOf(event.currentTarget);
      const after = event.key === "ArrowDown";
      const target = siblings[index + (after ? 1 : -1)]?.dataset.navigationId;
      if (target) {
        move(itemId, target, availableIds, after);
        keyboardOrder = useSidebarPreferences.getState().navigationOrder;
      }
    },
  };
}
