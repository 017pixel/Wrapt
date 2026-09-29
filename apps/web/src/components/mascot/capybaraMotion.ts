import type { CapybaraFrameName } from "./capybaraFrames";

/** Bewegungs- und Aktionsplanung des Capybaras als testbare reine Funktionen. */
export type CapybaraAction = "walk" | "blink" | "doubleBlink" | "look" | "hop" | "sneeze" | "yawn" | "party" | "stretch" | "sniff" | "wave" | "bow" | "wiggle";
export type CapybaraFacing = "left" | "right";

export type CapybaraAnimationName = "celebrate" | "hop" | "sneeze" | "yawn" | "stretch" | "sniff" | "wave" | "bow" | "wiggle";
export type CapybaraPreviewAction = "yawn" | "party" | "hop" | "stretch" | "sniff" | "wave" | "bow" | "wiggle";

export interface CapybaraAnimationStep {
  readonly frame: CapybaraFrameName;
  readonly duration: number;
}

/** Einzelne Frames statt CSS-Interpolation, damit der Pixelstil erhalten bleibt. */
export const CAPYBARA_ANIMATIONS: Readonly<Record<CapybaraAnimationName, readonly CapybaraAnimationStep[]>> = {
  celebrate: [
    { frame: "happyA", duration: 170 },
    { frame: "happyB", duration: 200 },
    { frame: "happyC", duration: 220 },
    { frame: "happyB", duration: 200 },
  ],
  hop: [
    { frame: "hopA", duration: 150 },
    { frame: "hopB", duration: 170 },
    { frame: "hopC", duration: 200 },
  ],
  sneeze: [
    { frame: "sneezeA", duration: 170 },
    { frame: "sneezeB", duration: 200 },
    { frame: "sneezeC", duration: 260 },
  ],
  yawn: [
    { frame: "blink", duration: 180 },
    { frame: "yawnA", duration: 300 },
    { frame: "yawnB", duration: 280 },
    { frame: "yawnB", duration: 580 },
    { frame: "yawnA", duration: 280 },
    { frame: "blink", duration: 180 },
    { frame: "calm", duration: 180 },
  ],
  stretch: [
    { frame: "calm", duration: 180 },
    { frame: "hopA", duration: 220 },
    { frame: "yawnA", duration: 300 },
    { frame: "hopA", duration: 220 },
    { frame: "calm", duration: 220 },
  ],
  sniff: [
    { frame: "lookLeft", duration: 260 },
    { frame: "sneezeA", duration: 190 },
    { frame: "lookRight", duration: 260 },
    { frame: "sneezeA", duration: 190 },
    { frame: "calm", duration: 220 },
  ],
  wave: [
    { frame: "happyA", duration: 200 },
    { frame: "happyB", duration: 190 },
    { frame: "happyC", duration: 190 },
    { frame: "happyB", duration: 190 },
    { frame: "happyA", duration: 220 },
    { frame: "calm", duration: 160 },
  ],
  bow: [
    { frame: "calm", duration: 160 },
    { frame: "hopA", duration: 240 },
    { frame: "hopB", duration: 340 },
    { frame: "hopA", duration: 240 },
    { frame: "calm", duration: 180 },
  ],
  wiggle: [
    { frame: "walkA", duration: 170 },
    { frame: "walkB", duration: 170 },
    { frame: "walkA", duration: 170 },
    { frame: "walkB", duration: 170 },
    { frame: "calm", duration: 200 },
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
  stretch: 0,
  sniff: 0,
  wave: 0,
  bow: 0,
  wiggle: 0,
};

/** Tageszeit-Stimmung: nachts schläfrig, morgens wach, abends ruhig. */
export type CapybaraPhase = "night" | "morning" | "day" | "evening";

const PHASE_WEIGHTS: Readonly<Record<CapybaraPhase, CapybaraActionWeights>> = {
  night: { walk: 0.17, blink: 0.29, look: 0.12, hop: 0.02, sneeze: 0.03, doubleBlink: 0.06, yawn: 0.2, party: 0, stretch: 0.03, sniff: 0.03, wave: 0.01, bow: 0.02, wiggle: 0.02 },
  morning: { walk: 0.33, blink: 0.18, look: 0.12, hop: 0.07, sneeze: 0.04, doubleBlink: 0.05, yawn: 0.02, party: 0.002, stretch: 0.06, sniff: 0.05, wave: 0.04, bow: 0.025, wiggle: 0.04 },
  day: { walk: 0.32, blink: 0.19, look: 0.12, hop: 0.07, sneeze: 0.05, doubleBlink: 0.04, yawn: 0.04, party: 0.0015, stretch: 0.04, sniff: 0.05, wave: 0.04, bow: 0.025, wiggle: 0.035 },
  evening: { walk: 0.27, blink: 0.22, look: 0.13, hop: 0.05, sneeze: 0.04, doubleBlink: 0.04, yawn: 0.08, party: 0.002, stretch: 0.05, sniff: 0.04, wave: 0.03, bow: 0.025, wiggle: 0.03 },
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
  return reducedMotion && (action === "walk" || action === "hop" || action === "sneeze" || action === "party" || action === "stretch" || action === "sniff" || action === "wave" || action === "bow" || action === "wiggle")
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
 * Längerer Partytanz: Anfedern, zwei volle Sprünge und ruhiges Ausklingen.
 * Bleibt bewusst in der Bühnenspur, damit nichts aus der Leiste läuft.
 */
export function buildCapybaraPartyPlan(random: () => number): readonly CapybaraPartyStep[] {
  const shuffle = 6 + Math.round(random() * 6);
  return [
    { frame: "party", action: "celebrate", duration: 500, facing: "right", offsetDelta: 0 },
    { frame: "hopA", action: "hop", duration: 260, facing: "left", offsetDelta: -shuffle / 2 },
    { frame: "hopB", action: "hop", duration: 330, facing: "left", offsetDelta: -shuffle },
    { frame: "hopC", action: "hop", duration: 300, facing: "left", offsetDelta: -shuffle },
    { frame: "party", action: "celebrate", duration: 500, facing: "left", offsetDelta: -shuffle },
    { frame: "hopA", action: "hop", duration: 260, facing: "right", offsetDelta: 0 },
    { frame: "hopB", action: "hop", duration: 330, facing: "right", offsetDelta: shuffle },
    { frame: "hopC", action: "hop", duration: 300, facing: "right", offsetDelta: shuffle },
    { frame: "party", action: "celebrate", duration: 520, facing: "right", offsetDelta: shuffle },
    { frame: "happyA", action: "celebrate", duration: 270, facing: "right", offsetDelta: shuffle / 2 },
    { frame: "party", action: "celebrate", duration: 600, facing: "right", offsetDelta: 0 },
  ];
}
