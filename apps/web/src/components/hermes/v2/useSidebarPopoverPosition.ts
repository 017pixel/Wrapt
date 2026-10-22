import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export interface SidebarMenuPoint { x: number; y: number }

/** Gemessene Bildschirmkoordinaten zurück in die skalierte Hermes-Fläche rechnen. */
export function useSidebarPopoverPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  popupRef: RefObject<HTMLElement | null>,
  point: SidebarMenuPoint | null = null,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = anchorRef.current;
      const popup = popupRef.current;
      if (!anchor || !popup) return;
      const scale = Number(getComputedStyle(anchor).getPropertyValue("--hermesv2-ui-scale")) || 1;
      const rect = anchor.getBoundingClientRect();
      const bounds = popup.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + 8;
      const top = (viewport?.offsetTop ?? 0) + 8;
      const right = left + (viewport?.width ?? innerWidth) - 16;
      const bottom = top + (viewport?.height ?? innerHeight) - 16;
      const fitsRight = rect.right + 8 + bounds.width <= right;
      const fitsLeft = rect.left - bounds.width - 8 >= left;
      const x = point?.x ?? (fitsRight ? rect.right + 8
        : fitsLeft ? rect.left - bounds.width - 8 : rect.left);
      const y = point?.y ?? (fitsRight || fitsLeft ? rect.top
        : rect.bottom + 8 + bounds.height <= bottom ? rect.bottom + 8
          : rect.top - bounds.height - 8);
      setStyle({
        position: "fixed", visibility: "visible",
        left: Math.max(left, Math.min(x, right - bounds.width)) / scale,
        top: Math.max(top, Math.min(y, bottom - bounds.height)) / scale,
        maxHeight: (bottom - top) / scale,
      });
    };
    update();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    if (popupRef.current) observer?.observe(popupRef.current);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef, popupRef, point]);
  return style;
}
