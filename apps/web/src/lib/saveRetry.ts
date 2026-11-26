import { useCallback, useEffect, useRef, useState } from "react";

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 5;

/**
 * Kleiner Retry-Controller für Client-Syncs (Terminal-Layout, Dateimanager).
 *
 * Ein fehlgeschlagener Save löst nicht sofort einen neuen Request aus, sondern
 * wartet mit exponentiellem Backoff. Nach fünf Fehlversuchen bleibt der lokale
 * Zustand erhalten, es werden aber keine automatischen Requests mehr gestartet;
 * die Oberfläche bietet dann „Erneut versuchen" an. Ein `tick`-Wechsel startet
 * den nächsten Lauf, sobald der Timer abläuft.
 */
export interface SaveRetryController {
  attempts: number;
  retryAt: number;
  blocked: boolean;
  /** Zählt Timer-Läufe und Nutzeraktionen; gehört in die Effekt-Abhängigkeiten. */
  tick: number;
  /** Plant den nächsten Versuch; `false` bedeutet Endzustand ohne Timer. */
  schedule(): boolean;
  /** Setzt den Zähler nach einem erfolgreichen Save oder einer Nutzeraktion zurück. */
  reset(): void;
  /** Sofortiger neuer Versuch (Nutzeraktion, Tab wieder sichtbar). */
  trigger(): void;
  /** Verzögerung, die `schedule` für den nächsten Versuch verwenden wird. */
  nextDelayMs(): number;
}

interface RetryState { attempts: number; retryAt: number; blocked: boolean; }

export function useSaveRetry(): SaveRetryController {
  const [state, setState] = useState<RetryState>({ attempts: 0, retryAt: 0, blocked: false });
  const [tick, setTick] = useState(0);
  // Der Ref ist die synchron lesbare Wahrheit; der State löst das Rendern aus.
  const current = useRef<RetryState & { timer: number | null }>({ attempts: 0, retryAt: 0, blocked: false, timer: null });
  const publish = () => setState({ attempts: current.current.attempts, retryAt: current.current.retryAt, blocked: current.current.blocked });
  const clearTimer = useCallback(() => {
    if (current.current.timer !== null) window.clearTimeout(current.current.timer);
    current.current.timer = null;
  }, []);
  useEffect(() => () => clearTimer(), [clearTimer]);
  const reset = useCallback(() => {
    clearTimer();
    current.current = { attempts: 0, retryAt: 0, blocked: false, timer: null };
    publish();
  }, [clearTimer]);
  const nextDelayMs = useCallback(() => Math.min(BASE_DELAY_MS * 2 ** current.current.attempts, MAX_DELAY_MS), []);
  const schedule = useCallback(() => {
    clearTimer();
    if (current.current.attempts >= MAX_ATTEMPTS) {
      current.current.blocked = true;
      current.current.retryAt = 0;
      publish();
      return false;
    }
    const delay = Math.min(BASE_DELAY_MS * 2 ** current.current.attempts, MAX_DELAY_MS);
    current.current.attempts += 1;
    current.current.retryAt = Date.now() + delay;
    current.current.timer = window.setTimeout(() => {
      current.current.timer = null;
      current.current.retryAt = 0;
      publish();
      setTick((value) => value + 1);
    }, delay);
    publish();
    return true;
  }, [clearTimer]);
  const trigger = useCallback(() => {
    reset();
    setTick((value) => value + 1);
  }, [reset]);
  return { ...state, tick, schedule, reset, trigger, nextDelayMs };
}
