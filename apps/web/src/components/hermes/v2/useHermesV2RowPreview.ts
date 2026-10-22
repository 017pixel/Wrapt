import { useCallback, useEffect, useRef, useState } from "react";

/** Kleine Verzögerung beim Überfahren; die Vorschau selbst bleibt erreichbar. */
export function useHermesV2RowPreview() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const close = useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);
  const show = useCallback(() => {
    cancel();
    setOpen(true);
  }, [cancel]);
  const start = useCallback(() => {
    cancel();
    if (typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      timer.current = setTimeout(() => setOpen(true), 300);
    }
  }, [cancel]);
  const end = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => setOpen(false), 150);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    const pointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".hermesv2-row-preview")) close();
    };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".hermesv2-row-preview")) close();
    };
    document.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", pointer);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", pointer);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);
  return { open, start, end, cancel, close, show };
}
