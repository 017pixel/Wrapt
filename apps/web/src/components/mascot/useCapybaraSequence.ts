import { useCallback, useEffect, useRef } from "react";
import type { CapybaraFrameName } from "./capybaraFrames";
import type { CapybaraAction, CapybaraAnimationName, CapybaraFacing } from "./capybaraMotion";

export type CapybaraVisualAction =
  | CapybaraAction
  | CapybaraAnimationName
  | "idle"
  | "sleep"
  | "wake";

export interface CapybaraSequenceStep {
  readonly frame: CapybaraFrameName;
  readonly action: CapybaraVisualAction;
  readonly duration: number;
  readonly facing?: CapybaraFacing;
  readonly offset?: number;
}

export interface CapybaraSequencer {
  readonly busy: { readonly current: boolean };
  readonly run: (steps: readonly CapybaraSequenceStep[]) => void;
  readonly stop: () => void;
}

/**
 * Spielt feste Frame-Sequenzen (Jubel, Gähnen, Partytanz) und hält die
 * Zufallsschleife so lange an. Beim Ende kehrt sie ins Ruhebild zurück.
 */
export function useCapybaraSequencer(
  setPoseFrame: (frame: CapybaraFrameName, action: CapybaraVisualAction, facing?: CapybaraFacing) => void,
  applyOffset: (offset: number) => void,
  showIdle: () => void,
): CapybaraSequencer {
  const busy = useRef(false);
  const timers = useRef<number[]>([]);

  const stop = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    busy.current = false;
  }, []);

  const run = useCallback(
    (steps: readonly CapybaraSequenceStep[]) => {
      stop();
      busy.current = true;
      let elapsed = 0;
      steps.forEach((step) => {
        const timer = window.setTimeout(() => {
          setPoseFrame(step.frame, step.action, step.facing);
          if (step.offset !== undefined) applyOffset(step.offset);
        }, elapsed);
        timers.current.push(timer);
        elapsed += step.duration;
      });
      const finish = window.setTimeout(() => {
        timers.current = [];
        busy.current = false;
        showIdle();
      }, elapsed);
      timers.current.push(finish);
    },
    [applyOffset, setPoseFrame, showIdle, stop],
  );

  useEffect(() => stop, [stop]);

  return { busy, run, stop };
}
