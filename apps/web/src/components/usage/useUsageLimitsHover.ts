import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Öffnungszustand der Limit-Card in der Statusleiste.
 *
 * Zwei Wege führen zur geöffneten Karte: Verweilen mit der Maus nach 700 ms
 * oder ein direkter Tipp. Der Verzögerungsweg gilt nur bei feiner Zeiger-
 * Eingabe — auf Touch wäre Warten eine Geste ohne Nutzen. Beim Schließen bleibt
 * die Karte kurz stehen, damit der Zeiger von der Leiste in sie wandern kann.
 */
const OPEN_DELAY_MS = 700;
const CLOSE_DELAY_MS = 200;

export interface UsageLimitsHoverState {
  /** True, solange die Karte sichtbar ist. */
  open: boolean;
  /** Der Element-Rechteck des Triggers; Position und Pointer-Gate stammen daraus. */
  anchor: HTMLElement | null;
  /** Anker-Element für Event-Handler am Trigger. */
  triggerRef: (element: HTMLElement | null) => void;
  onPointerEnter(): void;
  onPointerLeave(): void;
  onCardPointerEnter(): void;
  onCardPointerLeave(): void;
  onCardBlur(): void;
  /** Für Touch und Tastatur: sofort öffnen beziehungsweise schließen. */
  toggle(): void;
  close(): void;
}

/** Feine Zeigereingabe — auf Touch gibt es kein Hover, sondern nur Antippen. */
function canHover(): boolean {
  return typeof window.matchMedia !== "function" || window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function useUsageLimitsHover(): UsageLimitsHoverState {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, [clearTimers]);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimer.current = window.setTimeout(() => {
      setAnchor(trigger.current);
      setOpen(true);
      openTimer.current = null;
    }, OPEN_DELAY_MS);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, CLOSE_DELAY_MS);
  }, [clearTimers]);

  // Zeiger verlässt Trigger und Karte. `relatedTarget` liegt beim Wechsel
  // zwischen beiden noch innerhalb des Statusleisten-Bereichs.
  const onPointerLeave = useCallback(() => scheduleClose(), [scheduleClose]);

  const onPointerEnter = useCallback(() => {
    if (!canHover()) return;
    clearTimers();
    scheduleOpen();
  }, [clearTimers, scheduleOpen]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    open,
    anchor,
    triggerRef: (element) => {
      trigger.current = element;
      setAnchor(element);
    },
    onPointerEnter,
    onPointerLeave,
    // Beim Betreten der Karte wird eine laufende Schließung abgebrochen.
    onCardPointerEnter: () => clearTimers(),
    onCardPointerLeave: () => scheduleClose(),
    onCardBlur: () => close(),
    toggle: () => (open ? close() : (clearTimers(), setAnchor(trigger.current), setOpen(true))),
    close,
  };
}