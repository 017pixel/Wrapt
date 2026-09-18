import { useCallback, useEffect, useRef, useState } from "react";
import type { CapybaraFrameName } from "./capybaraFrames";
import {
  CAPYBARA_ANIMATIONS,
  buildCapybaraPartyPlan,
  capybaraActionForMotion,
  capybaraNapDelayMs,
  capybaraPhaseForHour,
  capybaraWeightsForHour,
  pickCapybaraAction,
  planCapybaraWalk,
  type CapybaraAnimationName,
  type CapybaraAnimationStep,
  type CapybaraFacing,
} from "./capybaraMotion";
import { useCapybaraIdle } from "./useCapybaraIdle";
import {
  useCapybaraSequencer,
  type CapybaraSequenceStep,
  type CapybaraVisualAction,
} from "./useCapybaraSequence";
import type { MascotMood } from "./mascotLines";

const MOOD_FRAME: Readonly<Record<MascotMood, CapybaraFrameName>> = {
  sleep: "sleep",
  worry: "worry",
  work: "calm",
  calm: "calm",
};

export const CAPYBARA_ITEM_WIDTH = 86;
export const WALK_STEP_MS = 230;
const IDLE_POLL_MS = 250;
const ACTION_MIN_MS = 1_200;
const ACTION_SPAN_MS = 3_000;
const BLINK_MS = 170;

export interface CapybaraStage {
  readonly width: number;
  readonly itemWidth: number;
}

export interface CapybaraBehaviorOptions {
  /** Überschreibt die aus der Tageszeit abgeleitete Nickerchen-Frist. */
  readonly napDelayMs?: number;
  /** Prüf- und Testhilfe: erzwingt eine bestimmte Stunde für Frist und Gewichtung. */
  readonly hour?: number;
}

export interface CapybaraBehavior {
  readonly frame: CapybaraFrameName;
  readonly offset: number;
  readonly action: CapybaraVisualAction;
  readonly facing: CapybaraFacing;
  readonly sleeping: boolean;
  readonly poke: () => void;
  readonly play: (animation: "yawn" | "party" | "hop") => void;
  readonly nap: () => void;
}

const DEFAULT_STAGE: CapybaraStage = { width: 0, itemWidth: CAPYBARA_ITEM_WIDTH };

const celebrateStep = (step: CapybaraAnimationStep): CapybaraSequenceStep => ({
  ...step,
  action: "celebrate",
});
// Beim Gähnen schaut es nach rechts, damit das offene Maul sichtbar bleibt.
const yawnStep = (step: CapybaraAnimationStep): CapybaraSequenceStep => ({
  ...step,
  action: "wake",
  facing: "right",
});
const hopStep = (step: CapybaraAnimationStep): CapybaraSequenceStep => ({
  ...step,
  action: "hop",
});
const REDUCED_CELEBRATE: readonly CapybaraSequenceStep[] = [
  { frame: "happyB", action: "celebrate", duration: 300 },
];

/** Partytanz als Sequenz, geclampt auf die Laufspur der Bühne. */
function partySequence(
  origin: number,
  maxOffset: number,
  random: () => number,
): { readonly steps: readonly CapybaraSequenceStep[]; readonly duration: number } {
  const plan = buildCapybaraPartyPlan(random);
  const clamp = (offset: number) => Math.min(maxOffset, Math.max(0, offset));
  return {
    duration: plan.reduce((sum, step) => sum + step.duration, 0),
    steps: plan.map((step) => ({
      frame: step.frame,
      action: step.action,
      duration: step.duration,
      facing: step.facing,
      offset: clamp(origin + step.offsetDelta),
    })),
  };
}

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

/** Steuert Laufstrecke, Zufallsaktionen, Nickerchen, Blick und Party. */
export function useCapybaraBehavior(
  mood: MascotMood,
  reducedMotion: boolean,
  stage: CapybaraStage = DEFAULT_STAGE,
  options: CapybaraBehaviorOptions = {},
): CapybaraBehavior {
  const baseFrame = MOOD_FRAME[mood];
  const baseFrameRef = useRef(baseFrame);
  baseFrameRef.current = baseFrame;
  const maxOffset = Math.max(0, stage.width - stage.itemWidth);
  const maxOffsetRef = useRef(maxOffset);
  maxOffsetRef.current = maxOffset;
  const hourOverrideRef = useRef(options.hour);
  hourOverrideRef.current = options.hour;

  const hourOverride = options.hour;
  const hour = hourOverride ?? new Date().getHours();
  const napDelayMs = options.napDelayMs ?? capybaraNapDelayMs(capybaraPhaseForHour(hour));
  const idle = useCapybaraIdle(napDelayMs, mood !== "sleep");
  const [forcedNap, setForcedNap] = useState(false);
  const sleeping = mood === "sleep" || idle || forcedNap;
  const sleepingRef = useRef(sleeping);
  sleepingRef.current = sleeping;
  const [pose, setPose] = useState<{
    frame: CapybaraFrameName;
    offset: number;
    action: CapybaraVisualAction;
    facing: CapybaraFacing;
  }>({ frame: baseFrame, offset: 0, action: "idle", facing: "right" });
  const positionRef = useRef(0);

  const setPoseFrame = useCallback(
    (frame: CapybaraFrameName, action: CapybaraVisualAction, facing?: CapybaraFacing) => {
      setPose((current) => {
        const nextFacing = facing ?? current.facing;
        return current.frame === frame && current.action === action && current.facing === nextFacing
          ? current
          : { ...current, frame, action, facing: nextFacing };
      });
    },
    [],
  );

  const applyPosition = useCallback((offset: number) => {
    const clamped = Math.min(maxOffsetRef.current, Math.max(0, offset));
    positionRef.current = clamped;
    setPose((current) => (current.offset === clamped ? current : { ...current, offset: clamped }));
  }, []);

  /** Ruhebild: Nickerchen oder Stimmung. */
  const showIdle = useCallback(() => {
    if (sleepingRef.current) {
      setPoseFrame("sleep", "sleep");
      return;
    }
    setPoseFrame(baseFrameRef.current, "idle");
  }, [setPoseFrame]);

  const { run: runSequence, busy: busyRef, stop: stopSequence } = useCapybaraSequencer(
    setPoseFrame,
    applyPosition,
    showIdle,
  );

  const startOffset = useRef(false);
  useEffect(() => {
    if (startOffset.current || maxOffset <= 0) return;
    startOffset.current = true;
    applyPosition(maxOffset * (0.15 + Math.random() * 0.7));
  }, [applyPosition, maxOffset]);
  useEffect(() => {
    if (startOffset.current) applyPosition(positionRef.current);
  }, [applyPosition, maxOffset]);

  // Ruhe und Blick bestimmen das Grundbild, solange keine Sequenz läuft.
  useEffect(() => {
    if (busyRef.current) return;
    showIdle();
  }, [busyRef, showIdle, sleeping]);

  // Aufwachen nach dem Nickerchen: erst gähnen, dann weiter.
  const wasSleeping = useRef(sleeping);
  useEffect(() => {
    const previous = wasSleeping.current;
    wasSleeping.current = sleeping;
    if (previous && !sleeping && !busyRef.current) {
      runSequence(CAPYBARA_ANIMATIONS.yawn.map((step) => ({ ...step, action: "wake" as const })));
    }
  }, [busyRef, runSequence, sleeping]);

  useEffect(() => {
    if (mood === "sleep") {
      setPoseFrame("sleep", "sleep");
      return;
    }
    let cancelled = false;
    const timers = new Set<number>();
    const wait = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          resolve();
        }, milliseconds);
        timers.add(timer);
      });
    const show = (frame: CapybaraFrameName, action: CapybaraVisualAction) => {
      if (!cancelled && !busyRef.current) setPoseFrame(frame, action);
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
        while (!cancelled && (busyRef.current || sleepingRef.current)) {
          await wait(IDLE_POLL_MS);
        }
        if (cancelled || busyRef.current) return;
        const weights = capybaraWeightsForHour(hourOverrideRef.current ?? new Date().getHours());
        const action = capybaraActionForMotion(pickCapybaraAction(Math.random, weights), reducedMotion);

        if (action === "walk") {
          if (maxOffsetRef.current <= 24) {
            show("lookRight", "look");
            await wait(600);
          } else {
            const plan = planCapybaraWalk(positionRef.current, maxOffsetRef.current, Math.random);
            const steps = Math.max(2, Math.ceil(plan.distance / 16));
            for (let step = 1; step <= steps && !cancelled; step += 1) {
              if (!busyRef.current) {
                setPoseFrame(step % 2 === 0 ? "walkA" : "walkB", "walk", plan.direction);
                applyPosition(plan.from + ((plan.to - plan.from) * step) / steps);
              }
              await wait(WALK_STEP_MS);
            }
          }
        } else if (action === "look") {
          show(Math.random() < 0.5 ? "lookLeft" : "lookRight", "look");
          await wait(700 + Math.random() * 700);
        } else if (action === "party") {
          const party = partySequence(positionRef.current, maxOffsetRef.current, Math.random);
          runSequence(party.steps);
          await wait(party.duration);
        } else if (action === "hop" || action === "sneeze" || action === "yawn") {
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
        if (!busyRef.current) showIdle();
      }
    };
    void run();
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [applyPosition, busyRef, mood, reducedMotion, runSequence, setPoseFrame, showIdle]);

  const poke = useCallback(() => {
    const wasAsleep = sleepingRef.current;
    setForcedNap(false);
    if (wasAsleep) {
      // Aus dem Nickerchen heraus wird zuerst gegähnt.
      runSequence(CAPYBARA_ANIMATIONS.yawn.map(yawnStep));
      return;
    }
    const celebrate = reducedMotion ? REDUCED_CELEBRATE : CAPYBARA_ANIMATIONS.celebrate.map(celebrateStep);
    runSequence(celebrate);
  }, [reducedMotion, runSequence]);

  const play = useCallback(
    (animation: "yawn" | "party" | "hop") => {
      setForcedNap(false);
      let steps: readonly CapybaraSequenceStep[];
      if (animation === "yawn") {
        steps = CAPYBARA_ANIMATIONS.yawn.map(yawnStep);
      } else if (reducedMotion) {
        steps = REDUCED_CELEBRATE;
      } else if (animation === "hop") {
        steps = CAPYBARA_ANIMATIONS.hop.map(hopStep);
      } else {
        steps = partySequence(positionRef.current, maxOffsetRef.current, Math.random).steps;
      }
      runSequence(steps);
    },
    [reducedMotion, runSequence],
  );

  const nap = useCallback(() => {
    stopSequence();
    setForcedNap(true);
  }, [stopSequence]);

  return {
    frame: pose.frame,
    offset: pose.offset,
    action: pose.action,
    facing: pose.facing,
    sleeping,
    poke,
    play,
    nap,
  };
}
