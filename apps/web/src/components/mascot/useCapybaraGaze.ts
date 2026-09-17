import { useEffect, useState, type RefObject } from "react";
import { capybaraGazeForPointer, type CapybaraFacing } from "./capybaraMotion";

/**
 * Beobachtet den Zeiger und liefert die Blickrichtung, sobald er in die Nähe
 * der Leiste kommt. Bewusst rAF-gedrosselt, damit Bewegung billig bleibt.
 * `centerOffset` beschreibt die Mitte des Capybaras relativ zur Zone; ohne
 * Angabe gilt die Mitte der Zone, wie in der zentrierten Vorschau.
 */
export function useCapybaraGaze(
  areaRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  centerOffset?: RefObject<number>,
): CapybaraFacing | null {
  const [gaze, setGaze] = useState<CapybaraFacing | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setGaze(null);
      return;
    }
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const apply = () => {
      frame = 0;
      const element = areaRef.current;
      if (element === null || pointer === null) return;
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + (centerOffset?.current ?? rect.width / 2);
      const next = capybaraGazeForPointer(pointer, rect, centerX);
      setGaze((current) => (current === next ? current : next));
    };
    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (frame === 0) frame = window.requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [areaRef, centerOffset, enabled]);

  return gaze;
}
