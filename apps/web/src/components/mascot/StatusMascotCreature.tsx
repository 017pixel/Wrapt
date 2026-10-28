import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { wraptQueries } from "../../lib/queryOptions";
import { preloadCapybaraImage, preloadCapybaraFrames } from "./capybaraImageCache";
import { CAPYBARA_FRAMES } from "./capybaraFrames";
import { CapybaraActor, CAPYBARA_SPRITE_SIZE } from "./CapybaraActor";
import { mascotContextFrom, mascotMood, selectMascotLine } from "./mascotLines";
import {
  CAPYBARA_ITEM_WIDTH,
  WALK_STEP_MS,
  useCapybaraBehavior,
  usePrefersReducedMotion,
} from "./useCapybaraBehavior";
import { useMascotReactions, type MascotReaction } from "./useMascotReactions";

const BUBBLE_VISIBLE_MS = 4_200;

export function StatusMascotCreature({ scale }: { readonly scale: number }) {
  const health = useQuery(wraptQueries.health());
  const usage = useQuery(wraptQueries.usage());
  const reducedMotion = usePrefersReducedMotion();

  const context = mascotContextFrom(
    usage.data?.providers ?? [],
    health.isError,
    false,
  );
  const mood = mascotMood(context);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  useEffect(() => {
    const element = stageRef.current;
    if (element === null) return;
    const update = () => setStageWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const itemWidth = Math.round(CAPYBARA_ITEM_WIDTH * scale);
  const spriteSize = Math.round(CAPYBARA_SPRITE_SIZE * scale);
  const stage = useMemo(
    () => ({ width: stageWidth, itemWidth }),
    [stageWidth, itemWidth],
  );
  const behavior = useCapybaraBehavior(mood, reducedMotion, stage);
  const react = useCallback(
    (reaction: MascotReaction) => behavior.play(reaction),
    [behavior],
  );
  useMascotReactions(react);

  const [line, setLine] = useState<string | null>(null);
  const [lineKey, setLineKey] = useState(0);
  const lastLine = useRef<string | undefined>(undefined);
  const bubbleTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
    },
    [],
  );

  const handlePoke = useCallback(() => {
    behavior.poke();
    const next = selectMascotLine(context, Math.random, lastLine.current);
    lastLine.current = next;
    setLine(next);
    setLineKey((key) => key + 1);
    if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => {
      setLine(null);
      bubbleTimer.current = null;
    }, BUBBLE_VISIBLE_MS);
  }, [behavior, context]);

  return (
    <div
      className={`status-mascot is-${mood}`}
      data-frame={behavior.frame}
      data-action={behavior.action}
      data-facing={behavior.facing}
      data-mood={mood}
      data-sleeping={String(behavior.sleeping)}
      data-scale={String(scale)}
      style={{
        "--capy-offset": `${behavior.offset}px`,
        "--capy-item-width": `${itemWidth}px`,
        "--capy-sprite-size": `${spriteSize}px`,
        "--capy-step": `${WALK_STEP_MS}ms`,
      } as CSSProperties}
    >
      <div ref={stageRef} className="status-mascot-stage">
        <CapybaraActor behavior={behavior} size={spriteSize} scale={scale}
          label="Capybara begrüßen" imageLabel="Capybara-Maskottchen" onClick={handlePoke} />
      </div>
      {line !== null ? (
        <span className="status-mascot-bubble-anchor">
          <span key={lineKey} className="status-mascot-bubble" role="status">
            {line}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** Das erste Bild dekodieren; kommende Animationsbilder anschließend vorladen. */
export async function prepareStatusMascot(): Promise<void> {
  await preloadCapybaraImage(CAPYBARA_FRAMES.calm);
  void preloadCapybaraFrames();
}
