/**
 * Bewegungs- und Aktionsplanung des Capybaras. Bewusst als reine Funktionen,
 * damit die Zufallslogik ohne DOM getestet werden kann.
 */
export type CapybaraAction = "walk" | "blink" | "doubleBlink" | "look" | "hop";

export interface CapybaraWalkPlan {
  readonly from: number;
  readonly to: number;
  readonly distance: number;
}

/** Aktionsmischung: viel laufen, dazwischen kurze Aufmerksamkeitsgesten. */
export function pickCapybaraAction(random: () => number): CapybaraAction {
  const roll = random();
  if (roll < 0.42) return "walk";
  if (roll < 0.68) return "blink";
  if (roll < 0.82) return "look";
  if (roll < 0.92) return "hop";
  return "doubleBlink";
}

/**
 * Wählt ein Laufziel innerhalb der Bühne. Bevorzugt eine zufällige Richtung;
 * ist dort kein Platz, wird die Richtung gedreht oder der nähere Rand genommen.
 */
export function planCapybaraWalk(
  position: number,
  maxOffset: number,
  random: () => number,
): CapybaraWalkPlan {
  const clampedPosition = Math.min(maxOffset, Math.max(0, position));
  if (maxOffset <= 0) {
    return { from: clampedPosition, to: clampedPosition, distance: 0 };
  }

  const distance = 40 + Math.round(random() * 110);
  const direction = random() < 0.5 ? -1 : 1;
  let target = clampedPosition + direction * distance;
  if (target < 0 || target > maxOffset) {
    const other = clampedPosition - direction * distance;
    if (other >= 0 && other <= maxOffset) {
      target = other;
    } else {
      target = maxOffset - clampedPosition > clampedPosition ? maxOffset : 0;
    }
  }

  const to = Math.min(maxOffset, Math.max(0, target));
  return { from: clampedPosition, to, distance: Math.abs(to - clampedPosition) };
}
