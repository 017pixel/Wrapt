import type { CapybaraFrameName } from "./capybaraFrames";

/** Bewegungs- und Aktionsplanung des Capybaras als testbare reine Funktionen. */
export type CapybaraAction = "walk" | "blink" | "doubleBlink" | "look" | "hop" | "sneeze" | "yawn" | "party";
export type CapybaraFacing = "left" | "right";

export type CapybaraAnimationName = "celebrate" | "hop" | "sneeze" | "yawn";

export interface CapybaraAnimationStep {
  readonly frame: CapybaraFrameName;
  readonly duration: number;
}

/** Einzelne Frames statt CSS-Interpolation, damit der Pixelstil erhalten bleibt. */
export const CAPYBARA_ANIMATIONS: Readonly<Record<CapybaraAnimationName, readonly CapybaraAnimationStep[]>> = {
  celebrate: [
    { frame: "happyA", duration: 120 },
    { frame: "happyB", duration: 140 },
    { frame: "happyC", duration: 160 },
    { frame: "happyB", duration: 140 },
  ],
  hop: [
    { frame: "hopA", duration: 120 },
    { frame: "hopB", duration: 130 },
    { frame: "hopC", duration: 170 },
  ],
  sneeze: [
    { frame: "sneezeA", duration: 140 },
    { frame: "sneezeB", duration: 170 },
    { frame: "sneezeC", duration: 230 },
  ],
  yawn: [
    { frame: "yawnA", duration: 260 },
    { frame: "yawnB", duration: 460 },
    { frame: "yawnA", duration: 240 },
  ],
};

export interface CapybaraWalkPlan {
  readonly from: number;
  readonly to: number;
  readonly distance: number;
  readonly direction: CapybaraFacing;
}

export type CapybaraActionWeights = Readonly<Record<CapybaraAction, number>>;

const NEUTRAL_WEIGHTS: CapybaraActionWeights = {
  walk: 0.42,
  blink: 0.26,
  look: 0.14,
  hop: 0.08,
  sneeze: 0.06,
  doubleBlink: 0.04,
  yawn: 0,
  party: 0,
};

/** Tageszeit-Stimmung: nachts schläfrig, morgens wach, abends ruhig. */
export type CapybaraPhase = "night" | "morning" | "day" | "evening";

const PHASE_WEIGHTS: Readonly<Record<CapybaraPhase, CapybaraActionWeights>> = {
  night: { walk: 0.18, blink: 0.32, look: 0.14, hop: 0.03, sneeze: 0.04, doubleBlink: 0.07, yawn: 0.2, party: 0 },
  morning: { walk: 0.42, blink: 0.22, look: 0.15, hop: 0.08, sneeze: 0.05, doubleBlink: 0.06, yawn: 0.02, party: 0.002 },
  day: { walk: 0.4, blink: 0.24, look: 0.15, hop: 0.08, sneeze: 0.06, doubleBlink: 0.05, yawn: 0.04, party: 0.0015 },
  evening: { walk: 0.34, blink: 0.26, look: 0.16, hop: 0.06, sneeze: 0.05, doubleBlink: 0.05, yawn: 0.08, party: 0.002 },
};

const NAP_DELAY_MS: Readonly<Record<CapybaraPhase, number>> = {
  night: 90_000,
  morning: 300_000,
  day: 300_000,
  evening: 240_000,
};

export function capybaraPhaseForHour(hour: number): CapybaraPhase {
  const normalized = ((Math.floor(hour) % 24) + 24) % 24;
  if (normalized >= 23 || normalized < 6) return "night";
  if (normalized < 12) return "morning";
  if (normalized < 18) return "day";
  return "evening";
}

export function capybaraWeightsForPhase(phase: CapybaraPhase): CapybaraActionWeights {
  return PHASE_WEIGHTS[phase];
}

export function capybaraWeightsForHour(hour: number): CapybaraActionWeights {
  return capybaraWeightsForPhase(capybaraPhaseForHour(hour));
}

/** Nachts wird das Capybara schneller müde. */
export function capybaraNapDelayMs(phase: CapybaraPhase): number {
  return NAP_DELAY_MS[phase];
}

/** Aktionsmischung: viel laufen, dazwischen kurze Aufmerksamkeitsgesten. */
export function pickCapybaraAction(
  random: () => number,
  weights: CapybaraActionWeights = NEUTRAL_WEIGHTS,
): CapybaraAction {
  const entries = Object.entries(weights) as [CapybaraAction, number][];
  const usable = entries.filter(([, weight]) => weight > 0);
  const total = usable.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return "blink";
  let roll = random() * total;
  let last: CapybaraAction = "blink";
  for (const [action, weight] of usable) {
    last = action;
    roll -= weight;
    if (roll < 0) return action;
  }
  return last;
}

/** Ersetzt bewegungsintensive Aktionen bei reduzierter Bewegung. */
export function capybaraActionForMotion(action: CapybaraAction, reducedMotion: boolean): CapybaraAction {
  return reducedMotion && (action === "walk" || action === "hop" || action === "sneeze" || action === "party")
    ? "blink"
    : action;
}

/** Wählt ein Laufziel innerhalb der Bühne und dreht am Rand die Richtung. */
export function planCapybaraWalk(
  position: number,
  maxOffset: number,
  random: () => number,
): CapybaraWalkPlan {
  const clampedPosition = Math.min(maxOffset, Math.max(0, position));
  if (maxOffset <= 0) {
    return { from: clampedPosition, to: clampedPosition, distance: 0, direction: "right" };
  }

  const distance = 40 + Math.round(random() * 110);
  const direction = random() < 0.5 ? -1 : 1;
  let target = clampedPosition + direction * distance;
  if (target < 0 || target > maxOffset) {
    const other = clampedPosition - direction * distance;
    target = other >= 0 && other <= maxOffset
      ? other
      : maxOffset - clampedPosition > clampedPosition ? maxOffset : 0;
  }

  const to = Math.min(maxOffset, Math.max(0, target));
  return {
    from: clampedPosition,
    to,
    distance: Math.abs(to - clampedPosition),
    direction: to < clampedPosition ? "left" : "right",
  };
}

export interface CapybaraPartyStep {
  readonly frame: CapybaraFrameName;
  readonly action: "celebrate" | "hop";
  readonly duration: number;
  readonly facing: CapybaraFacing;
  readonly offsetDelta: number;
}

/**
 * Kurzer Partytanz: Hut auf, ein paar Hüpfer nach links und rechts, Jubel.
 * Bleibt bewusst in der Bühnenspur, damit nichts aus der Leiste läuft.
 */
export function buildCapybaraPartyPlan(random: () => number): readonly CapybaraPartyStep[] {
  const shuffle = 6 + Math.round(random() * 6);
  return [
    { frame: "party", action: "celebrate", duration: 280, facing: "right", offsetDelta: 0 },
    { frame: "hopA", action: "hop", duration: 130, facing: "left", offsetDelta: -shuffle },
    { frame: "party", action: "celebrate", duration: 240, facing: "left", offsetDelta: -shuffle },
    { frame: "hopB", action: "hop", duration: 140, facing: "right", offsetDelta: shuffle },
    { frame: "party", action: "celebrate", duration: 240, facing: "right", offsetDelta: shuffle },
    { frame: "happyA", action: "celebrate", duration: 160, facing: "right", offsetDelta: 0 },
    { frame: "party", action: "celebrate", duration: 300, facing: "right", offsetDelta: 0 },
  ];
}

export interface CapybaraGazeArea {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const GAZE_REACH_Y = 140;
const GAZE_REACH_X = 80;

/**
 * Blickrichtung zum Mauszeiger, sobald er in die Nähe der Leiste kommt.
 * Sonst sieht das Capybara nach vorn (null).
 */
export function capybaraGazeForPointer(
  pointer: { readonly x: number; readonly y: number },
  area: CapybaraGazeArea,
  mascotCenterX: number,
): CapybaraFacing | null {
  if (area.right <= area.left || area.bottom <= area.top) return null;
  if (pointer.y < area.top - GAZE_REACH_Y || pointer.y > area.bottom + GAZE_REACH_Y) return null;
  if (pointer.x < area.left - GAZE_REACH_X || pointer.x > area.right + GAZE_REACH_X) return null;
  return pointer.x < mascotCenterX ? "left" : "right";
}
