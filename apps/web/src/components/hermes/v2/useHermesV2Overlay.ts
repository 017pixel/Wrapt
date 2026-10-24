import type { CSSProperties, RefObject } from "react";
import { useAnchoredOverlay } from "../../../lib/useAnchoredOverlay";

/** Browserkoordinaten bleiben physisch; das skalierte Portal braucht Layoutpixel. */
export function useHermesV2Overlay(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  options: { width: number; gap: number; align?: "start" | "end" },
): CSSProperties {
  const anchor = anchorRef.current;
  const scale = anchor
    ? Number(getComputedStyle(anchor).getPropertyValue("--hermesv2-ui-scale")) || 1
    : 1;
  const style = useAnchoredOverlay(open, anchorRef, {
    width: options.width * scale,
    gap: options.gap * scale,
    gutter: 8 * scale,
    ...(options.align === undefined ? {} : { align: options.align }),
  });
  const scaled = { ...style };
  for (const key of ["left", "top", "bottom", "width", "maxHeight"] as const) {
    const value = scaled[key];
    if (typeof value === "number") scaled[key] = value / scale;
  }
  return scaled;
}
