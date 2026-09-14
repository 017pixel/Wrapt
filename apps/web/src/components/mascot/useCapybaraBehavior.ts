import { useCallback, useEffect, useRef, useState } from "react";
import type { CapybaraFrameName } from "./capybaraFrames";
import { pickCapybaraAction, planCapybaraWalk } from "./capybaraMotion";
import type { MascotMood } from "./mascotLines";

const MOOD_FRAME: Readonly<Record<MascotMood, CapybaraFrameName>> = {
  sleep: "sleep",
  worry: "worry",
  // Arbeiten bleibt bewusst gelassen: Capybaras stressen nicht.
  work: "calm",
  calm: "calm",
};

export const CAPYBARA_ITEM_WIDTH = 46;
const WALK_STEP_MS = 210;
const ACTION_MIN_MS = 1_200;
const ACTION_SPAN_MS = 3_000;
const BLINK_MS = 170;
const HOP_MS = 460;
const POKE_MS = 460;

export interface CapybaraStage {
  /** Innenbreite der Laufstrecke in der Statusleiste. */
  readonly width: number;
  /** Breite der klickbaren Figur; bestimmt den rechten Anschlag. */
  readonly itemWidth: number;
}

export interface CapybaraBehavior {
  readonly frame: CapybaraFrameName;
  readonly offset: number;
  readonly poke: () => void;
}

const DEFAULT_STAGE: CapybaraStage = { width: 0, itemWidth: CAPYBARA_ITEM_WIDTH };

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Leben des Maskottchens: Es wandert zufällig über die verfügbare Bühne und
 * macht dazwischen kurze Gesten (blinzeln, schauen, hüpfen, zwinkern).
 * `poke` ist die Klickreaktion und bleibt an der aktuellen Position.
 */
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

  const [pose, setPose] = useState<{ frame: CapybaraFrameName; offset: number }>({
    frame: baseFrame,
    offset: 0,
  });
  const positionRef = useRef(0);

  const setFrame = useCallback((frame: CapybaraFrameName) => {
    setPose((current) => (current.frame === frame ? current : { ...current, frame }));
  }, []);

  const applyPosition = useCallback((offset: number) => {
    const clamped = Math.min(maxOffsetRef.current, Math.max(0, offset));
    positionRef.current = clamped;
    setPose((current) => (current.offset === clamped ? current : { ...current, offset: clamped }));
  }, []);

  // Startpunkt einmalig zufällig über die Bühne verteilen; bei späterem
  // Resize wird nur noch in den erlaubten Bereich geklemmt.
  const startChosen = useRef(false);
  useEffect(() => {
    if (startChosen.current || maxOffset <= 0) return;
    startChosen.current = true;
    applyPosition(maxOffset * (0.15 + Math.random() * 0.7));
  }, [applyPosition, maxOffset]);
  useEffect(() => {
    if (!startChosen.current) return;
    applyPosition(positionRef.current);
  }, [applyPosition, maxOffset]);

  useEffect(() => {
    if (mood === "sleep") {
      setFrame("sleep");
      return;
    }
    setFrame(baseFrame);

    let cancelled = false;
    const timers: number[] = [];
    const wait = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        timers.push(
          window.setTimeout(() => {
            if (!cancelled) resolve();
          }, milliseconds),
        );
      });

    const run = async () => {
      while (!cancelled) {
        await wait(ACTION_MIN_MS + Math.random() * ACTION_SPAN_MS);
        if (cancelled) return;
        let action = pickCapybaraAction(Math.random);
        if (reducedMotion && (action === "walk" || action === "hop")) {
          action = "blink";
        }

        if (action === "walk") {
          if (maxOffsetRef.current <= 24) {
            setFrame("lookRight");
            await wait(600);
          } else {
            const plan = planCapybaraWalk(positionRef.current, maxOffsetRef.current, Math.random);
            const steps = Math.max(2, Math.ceil(plan.distance / 12));
            for (let step = 1; step <= steps && !cancelled; step += 1) {
              setFrame(step % 2 === 0 ? "walkA" : "walkB");
              applyPosition(plan.from + ((plan.to - plan.from) * step) / steps);
              await wait(WALK_STEP_MS);
            }
          }
        } else if (action === "look") {
          setFrame(Math.random() < 0.5 ? "lookLeft" : "lookRight");
          await wait(700 + Math.random() * 700);
        } else if (action === "hop") {
          setFrame("jump");
          await wait(HOP_MS);
        } else if (action === "doubleBlink") {
          setFrame("blink");
          await wait(BLINK_MS - 20);
          setFrame(baseFrameRef.current);
          await wait(130);
          setFrame("blink");
          await wait(BLINK_MS);
        } else {
          setFrame("blink");
          await wait(BLINK_MS);
        }

        if (!cancelled) setFrame(baseFrameRef.current);
      }
    };
    void run();

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [applyPosition, baseFrame, mood, reducedMotion, setFrame]);

  const pokeTimer = useRef<number | null>(null);
  const poke = useCallback(() => {
    setFrame("jump");
    if (pokeTimer.current !== null) window.clearTimeout(pokeTimer.current);
    pokeTimer.current = window.setTimeout(() => {
      setFrame(baseFrameRef.current);
      pokeTimer.current = null;
    }, POKE_MS);
  }, [setFrame]);
  useEffect(
    () => () => {
      if (pokeTimer.current !== null) window.clearTimeout(pokeTimer.current);
    },
    [],
  );

  return { frame: pose.frame, offset: pose.offset, poke };
}
