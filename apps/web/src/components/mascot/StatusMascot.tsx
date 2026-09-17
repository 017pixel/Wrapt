import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { wraptQueries } from "../../lib/queryOptions";
import { useOrbitStore } from "../../stores/orbit";
import { CapybaraSprite } from "./CapybaraSprite";
import { CapybaraZzz } from "./CapybaraZzz";
import { mascotContextFrom, mascotMood, selectMascotLine } from "./mascotLines";
import {
  CAPYBARA_ITEM_WIDTH,
  WALK_STEP_MS,
  useCapybaraBehavior,
  usePrefersReducedMotion,
} from "./useCapybaraBehavior";
import { useCapybaraGaze } from "./useCapybaraGaze";
import { useMascotReactions, type MascotReaction } from "./useMascotReactions";

const BUBBLE_VISIBLE_MS = 4_200;
const STATUS_SPRITE_SIZE = 80;

/**
 * Capybara in der Statusleiste. Die Komponente lädt ihren Zustand selbst,
 * damit sie später ohne Umbau an anderen Stellen der Oberfläche leben kann.
 */
export function StatusMascot() {
  const mascot = useQuery(wraptQueries.mascot());
  if (mascot.data?.mascot.enabled !== true) return null;
  return <StatusMascotCreature />;
}

function StatusMascotCreature() {
  const health = useQuery(wraptQueries.health());
  const usage = useQuery(wraptQueries.usage());
  const orbitDirty = useOrbitStore((state) => state.dirty);
  const orbitSaving = useOrbitStore((state) => state.saving);
  const reducedMotion = usePrefersReducedMotion();

  const context = mascotContextFrom(
    usage.data?.providers ?? [],
    health.isError,
    orbitDirty || orbitSaving,
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
  const stage = useMemo(
    () => ({ width: stageWidth, itemWidth: CAPYBARA_ITEM_WIDTH }),
    [stageWidth],
  );
  const centerOffset = useRef(CAPYBARA_ITEM_WIDTH / 2);
  const gaze = useCapybaraGaze(stageRef, mood !== "sleep", centerOffset);
  const behavior = useCapybaraBehavior(mood, reducedMotion, stage, { gaze });
  centerOffset.current = behavior.offset + CAPYBARA_ITEM_WIDTH / 2;
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
      data-gaze={gaze ?? "none"}
      data-sleeping={String(behavior.sleeping)}
      style={{
        "--capy-offset": `${behavior.offset}px`,
        "--capy-item-width": `${CAPYBARA_ITEM_WIDTH}px`,
        "--capy-step": `${WALK_STEP_MS}ms`,
      } as CSSProperties}
    >
      <div ref={stageRef} className="status-mascot-stage">
        <button
          type="button"
          className="status-mascot-button"
          onClick={handlePoke}
          aria-label="Capybara begrüßen"
        >
          <CapybaraSprite frame={behavior.frame} size={STATUS_SPRITE_SIZE} label="Capybara-Maskottchen" />
          {behavior.sleeping ? <CapybaraZzz /> : null}
        </button>
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
