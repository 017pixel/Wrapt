import { useEffect } from "react";
import type { RefObject } from "react";

interface DismissibleOptions {
  open: boolean;
  onClose: () => void;
  /** Wurzel des Popups; Klicks darin schließen nicht. */
  rootRef?: RefObject<HTMLElement | null>;
  /** Escape schließt mit (Standard: true). */
  escape?: boolean;
}

/**
 * Schließt Popups bei Klick außerhalb und per Escape. Trigger-Elemente mit
 * `data-dismiss-ignore` bleiben ausgenommen, damit ein Klick auf den Auslöser
 * das Menü nicht erst schließt und dann sofort wieder öffnet.
 */
export function useDismissible({ open, onClose, rootRef, escape = true }: DismissibleOptions) {
  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      if (target.closest("[data-dismiss-ignore]") !== null) return true;
      return rootRef?.current?.contains(target) ?? false;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (isInside(event.target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!escape || event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, onClose, rootRef, escape]);
}
