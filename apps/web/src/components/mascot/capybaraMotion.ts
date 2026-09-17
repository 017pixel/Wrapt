import type { CapybaraFrameName } from "./capybaraFrames";

/** Bewegungs- und Aktionsplanung des Capybaras als testbare reine Funktionen. */
export type CapybaraAction = "walk" | "blink" | "doubleBlink" | "look" | "hop" | "sneeze";
export type CapybaraFacing = "left" | "right";

export type CapybaraAnimationName = "celebrate" | "hop" | "sneeze";

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
};

export interface CapybaraWalkPlan {
  readonly from: number;
  readonly to: number;
  readonly distance: number;
  readonly direction: CapybaraFacing;
}

/** Aktionsmischung: viel laufen, dazwischen kurze Aufmerksamkeitsgesten. */
export function pickCapybaraAction(random: () => number): CapybaraAction {
  const roll = random();
  if (roll < 0.42) return "walk";
  if (roll < 0.68) return "blink";
  if (roll < 0.82) return "look";
  if (roll < 0.9) return "hop";
  if (roll < 0.96) return "sneeze";
  return "doubleBlink";
}

/** Ersetzt bewegungsintensive Aktionen bei reduzierter Bewegung durch Blinzeln. */
export function capybaraActionForMotion(action: CapybaraAction, reducedMotion: boolean): CapybaraAction {
  return reducedMotion && (action === "walk" || action === "hop" || action === "sneeze")
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
