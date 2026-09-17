import { useEffect, useState } from "react";

const CAPYBARA_IDLE_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"] as const;

/**
 * Meldet Ruhe, wenn seit der letzten Eingabe die Verzögerung vergangen ist.
 * Jede neue Eingabe startet die Frist neu.
 */
export function useCapybaraIdle(delayMs: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled || delayMs <= 0 || typeof window === "undefined") {
      setIdle(false);
      return;
    }
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), delayMs);
    };
    const touch = () => {
      setIdle((current) => (current ? false : current));
      arm();
    };
    setIdle(false);
    arm();
    CAPYBARA_IDLE_EVENTS.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      CAPYBARA_IDLE_EVENTS.forEach((name) => window.removeEventListener(name, touch));
    };
  }, [delayMs, enabled]);

  return idle;
}
