import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

const preferenceKey = "wrapt.hermes-v2.sidebar-layout.v1";
// Die Bereichsleiste am unteren Rand braucht 6 × 44 px; schmaler würde ihre
// Ziele untereinander schieben oder scrollen lassen.
const minimum = 264;
const maximum = 480;
const defaultWidth = 272;
const clamp = (width: number) => Math.round(Math.min(maximum, Math.max(minimum, width)));

function readWidth(): number {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
    if (saved && typeof saved === "object" && "version" in saved && saved.version === 1
      && "width" in saved && typeof saved.width === "number" && Number.isFinite(saved.width)) return clamp(saved.width);
  } catch { /* Fehlende oder ungültige Präferenzen verwenden die Standardbreite. */ }
  return defaultWidth;
}

/** Breiten sind Layoutpixel; Pointerkoordinaten berücksichtigen den Hermes-Zoom. */
export function useHermesV2SidebarWidth(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const [width, setWidth] = useState(readWidth);
  const [resizing, setResizing] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const limit = useCallback((value: number) => {
    const available = root.current?.clientWidth ?? 0;
    return clamp(Math.min(value, available > 0 ? Math.max(minimum, available * .55) : maximum));
  }, [root]);
  const save = useCallback((value: number) => {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ version: 1, width: value })); }
    catch { /* Die Größenanpassung funktioniert auch ohne beschreibbaren Speicher. */ }
  }, []);

  useEffect(() => {
    if (!enabled) stopRef.current?.();
  }, [enabled]);
  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === preferenceKey || event.key === null) setWidth(readWidth());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    stopRef.current?.();
    const start = event.clientX;
    const initialWidth = width;
    const scale = Number(root.current ? getComputedStyle(root.current).zoom : 1) || 1;
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    let latest = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setResizing(true);
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      latest = limit(initialWidth + (next.clientX - start) / scale);
      setWidth(latest);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
      setResizing(false);
      save(latest);
      stopRef.current = null;
    };
    const end = (next: globalThis.PointerEvent) => {
      if (next.pointerId === event.pointerId) stop();
    };
    stopRef.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", stop);
  }, [enabled, width, root, limit, save]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const next = event.key === "Home" ? minimum
      : event.key === "End" ? maximum
      : event.key === "ArrowLeft" ? width - (event.shiftKey ? 32 : 8)
      : event.key === "ArrowRight" ? width + (event.shiftKey ? 32 : 8) : null;
    if (next === null) return;
    event.preventDefault();
    const value = limit(next);
    setWidth(value);
    save(value);
  };
  const reset = () => { setWidth(defaultWidth); save(defaultWidth); };
  return {
    width, resizing,
    style: { "--hermesv2-sidebar-width": `${width}px` } as CSSProperties,
    separatorProps: {
      role: "separator", tabIndex: 0, "aria-label": "Breite der Hermes-Seitenleiste",
      "aria-orientation": "vertical" as const, "aria-valuemin": minimum,
      "aria-valuemax": maximum, "aria-valuenow": width,
      "aria-controls": undefined,
      onPointerDown, onKeyDown, onDoubleClick: reset,
    },
  };
}
