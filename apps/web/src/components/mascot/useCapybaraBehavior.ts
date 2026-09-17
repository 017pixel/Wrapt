import { useCallback, useEffect, useRef, useState } from "react";
import type { CapybaraFrameName } from "./capybaraFrames";
import {
  CAPYBARA_ANIMATIONS,
  capybaraActionForMotion,
  pickCapybaraAction,
  planCapybaraWalk,
  type CapybaraAction,
  type CapybaraAnimationName,
  type CapybaraFacing,
} from "./capybaraMotion";
import type { MascotMood } from "./mascotLines";

const MOOD_FRAME: Readonly<Record<MascotMood, CapybaraFrameName>> = {
  sleep: "sleep",
  worry: "worry",
  work: "calm",
  calm: "calm",
};

export const CAPYBARA_ITEM_WIDTH = 78;
export const WALK_STEP_MS = 230;
const ACTION_MIN_MS = 1_200;
const ACTION_SPAN_MS = 3_000;
const BLINK_MS = 170;

export interface CapybaraStage {
  readonly width: number;
  readonly itemWidth: number;
}

type CapybaraVisualAction = CapybaraAction | CapybaraAnimationName | "idle" | "sleep";

export interface CapybaraBehavior {
  readonly frame: CapybaraFrameName;
  readonly offset: number;
  readonly action: CapybaraVisualAction;
  readonly facing: CapybaraFacing;
  readonly poke: () => void;
}

const DEFAULT_STAGE: CapybaraStage = { width: 0, itemWidth: CAPYBARA_ITEM_WIDTH };

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Steuert Laufstrecke, zufällige Aktionen und die direkte Klickreaktion. */
export function useCapybaraBehavior(
  mood: MascotMood,
  reducedMotion: boolean,
  stage: CapybaraStage = DEFAULT_STAGE,
): CapybaraBehavior {
  const baseFrame = MOOD_FRAME[mood];
  const baseFrameRef = useRef(baseFrame);
  baseFrameRef.current = baseFrame;
  const maxOffset = Math.max(0, stage.width - stage.itemWidth);
  const maxOffsetRef = useRef(maxOffset);
  maxOffsetRef.current = maxOffset;

  const [pose, setPose] = useState<{
    frame: CapybaraFrameName;
    offset: number;
    action: CapybaraVisualAction;
    facing: CapybaraFacing;
  }>({ frame: baseFrame, offset: 0, action: "idle", facing: "right" });
  const positionRef = useRef(0);
  const pokeActiveRef = useRef(false);
  const pokeTimers = useRef<number[]>([]);

  const setPoseFrame = useCallback((frame: CapybaraFrameName, action: CapybaraVisualAction, facing?: CapybaraFacing) => {
    setPose((current) => {
      const nextFacing = facing ?? current.facing;
      return current.frame === frame && current.action === action && current.facing === nextFacing
        ? current
        : { ...current, frame, action, facing: nextFacing };
    });
  }, []);

  const applyPosition = useCallback((offset: number) => {
    const clamped = Math.min(maxOffsetRef.current, Math.max(0, offset));
    positionRef.current = clamped;
    setPose((current) => current.offset === clamped ? current : { ...current, offset: clamped });
  }, []);

  const clearPokeTimers = useCallback(() => {
    pokeTimers.current.forEach((timer) => window.clearTimeout(timer));
    pokeTimers.current = [];
  }, []);

  // Der Startpunkt verteilt sich einmalig über die verfügbare Laufstrecke.
  const startChosen = useRef(false);
  useEffect(() => {
    if (startChosen.current || maxOffset <= 0) return;
    startChosen.current = true;
    applyPosition(maxOffset * (0.15 + Math.random() * 0.7));
  }, [applyPosition, maxOffset]);
  useEffect(() => {
    if (startChosen.current) applyPosition(positionRef.current);
  }, [applyPosition, maxOffset]);

  useEffect(() => {
    if (mood === "sleep") {
      setPoseFrame("sleep", "sleep");
      return;
    }
    setPoseFrame(baseFrame, "idle");
    let cancelled = false;
    const timers: number[] = [];
    const wait = (milliseconds: number) => new Promise<void>((resolve) => {
      timers.push(window.setTimeout(resolve, milliseconds));
    });
    const show = (frame: CapybaraFrameName, action: CapybaraVisualAction) => {
      if (!cancelled && !pokeActiveRef.current) setPoseFrame(frame, action);
    };
    const playAnimation = async (name: CapybaraAnimationName) => {
      for (const step of CAPYBARA_ANIMATIONS[name]) {
        show(step.frame, name);
        await wait(step.duration);
        if (cancelled) return;
      }
    };

    const run = async () => {
      while (!cancelled) {
        await wait(ACTION_MIN_MS + Math.random() * ACTION_SPAN_MS);
        if (cancelled) return;
        const action = capybaraActionForMotion(pickCapybaraAction(Math.random), reducedMotion);

        if (action === "walk") {
          if (maxOffsetRef.current <= 24) {
            show("lookRight", "look");
            await wait(600);
          } else {
            const plan = planCapybaraWalk(positionRef.current, maxOffsetRef.current, Math.random);
            const steps = Math.max(2, Math.ceil(plan.distance / 16));
            for (let step = 1; step <= steps && !cancelled; step += 1) {
              if (!pokeActiveRef.current) {
                setPoseFrame(step % 2 === 0 ? "walkA" : "walkB", "walk", plan.direction);
                applyPosition(plan.from + ((plan.to - plan.from) * step) / steps);
              }
              await wait(WALK_STEP_MS);
            }
          }
        } else if (action === "look") {
          show(Math.random() < 0.5 ? "lookLeft" : "lookRight", "look");
          await wait(700 + Math.random() * 700);
        } else if (action === "hop" || action === "sneeze") {
          await playAnimation(action);
        } else if (action === "doubleBlink") {
          show("blink", "blink");
          await wait(BLINK_MS);
          show(baseFrameRef.current, "idle");
          await wait(130);
          show("blink", "blink");
          await wait(BLINK_MS);
        } else {
          show("blink", "blink");
          await wait(BLINK_MS);
        }
        show(baseFrameRef.current, "idle");
      }
    };
    void run();
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [applyPosition, baseFrame, mood, reducedMotion, setPoseFrame]);

  const poke = useCallback(() => {
    clearPokeTimers();
    pokeActiveRef.current = true;
    let elapsed = 0;
    const sequence = reducedMotion
      ? [{ frame: "happyB" as const, duration: 240 }]
      : CAPYBARA_ANIMATIONS.celebrate;
    sequence.forEach((step) => {
      const timer = window.setTimeout(() => setPoseFrame(step.frame, "celebrate"), elapsed);
      pokeTimers.current.push(timer);
      elapsed += step.duration;
    });
    const resetTimer = window.setTimeout(() => {
      pokeActiveRef.current = false;
      setPoseFrame(baseFrameRef.current, mood === "sleep" ? "sleep" : "idle");
      pokeTimers.current = [];
    }, elapsed);
    pokeTimers.current.push(resetTimer);
  }, [clearPokeTimers, mood, reducedMotion, setPoseFrame]);

  useEffect(() => () => clearPokeTimers(), [clearPokeTimers]);

  return { frame: pose.frame, offset: pose.offset, action: pose.action, facing: pose.facing, poke };
}
