/**
 * Reine Geometrie der Hauptnavigation: Grenzen, Rastpunkte, Schwellen und
 * Modus-Ableitung. Bewusst ohne DOM, damit Ziehen, Tastatur und gespeicherter
 * Zustand dieselben Regeln nutzen und einzeln testbar bleiben.
 */

export const SIDEBAR_WIDTH_MIN = 176;
export const SIDEBAR_WIDTH_MAX = 400;
export const SIDEBAR_WIDTH_DEFAULT = 256;
export const SIDEBAR_COLLAPSED_WIDTH = 56;

/** Unter dieser Breite gibt es keine Beschriftungen mehr; die Leiste klappt ein. */
export const SIDEBAR_COLLAPSE_THRESHOLD = 176;
/** Ab dieser Breite öffnet ein Zug aus dem eingeklappten Zustand heraus. */
export const SIDEBAR_EXPAND_THRESHOLD = 180;
/** Darunter beginnt der schmale Modus mit Ellipsis statt voller Beschriftung. */
export const SIDEBAR_NARROW_THRESHOLD = 200;

export const SIDEBAR_KEYBOARD_STEP = 8;
export const SIDEBAR_KEYBOARD_STEP_LARGE = 32;

/** Rastpunkte beim Loslassen, bewusst ohne Widerstand während des Ziehens. */
export const SIDEBAR_SNAP_POINTS = [208, 256, 320, 400] as const;

export interface SidebarLayoutState {
  collapsed: boolean;
  width: number;
}

export type SidebarDisplayMode = "collapsed" | "compact" | "narrow" | "regular";

export type SidebarKeyboardResult =
  | { type: "resize"; width: number }
  | { type: "expand"; width: number }
  | { type: "collapse" }
  | null;

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

/**
 * Nächstgelegener Rastpunkt. `minimum` und `maximum` schließen Punkte außerhalb
 * des erlaubten Bereichs aus, damit ein Öffnen aus dem eingeklappten Zustand
 * nicht direkt wieder im Kompaktmodus landet und die Tablet-Breite erhalten bleibt.
 */
export function snapSidebarWidth(width: number, minimum = SIDEBAR_WIDTH_MIN, maximum = SIDEBAR_WIDTH_MAX): number {
  const upper = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, Math.round(maximum)));
  const lower = Math.max(SIDEBAR_WIDTH_MIN, Math.min(minimum, upper));
  const clamped = Math.min(upper, Math.max(lower, Math.round(width)));
  const candidates: number[] = SIDEBAR_SNAP_POINTS.filter((point) => point >= lower && point <= upper);
  // Die tatsächliche Obergrenze (etwa 22 % der Tablet-Breite) ist selbst ein
  // gültiger Rastpunkt, sonst würde ein Zug am Anschlag beim Loslassen schrumpfen.
  if (upper > lower && !candidates.includes(upper)) candidates.push(upper);
  const fallback = candidates.at(-1) ?? clamped;
  return candidates.reduce(
    (best, point) => Math.abs(point - clamped) < Math.abs(best - clamped) ? point : best,
    fallback,
  );
}

/** Breite während des Ziehens: folgt dem Zeiger, ohne an der Mindestbreite zu klemmen. */
export function sidebarLiveWidth(startWidth: number, deltaX: number, maximum = SIDEBAR_WIDTH_MAX): number {
  const upper = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, maximum));
  const width = Math.min(upper, Math.max(SIDEBAR_COLLAPSED_WIDTH, startWidth + deltaX));
  return Math.round(width);
}

export function sidebarDisplayMode(collapsed: boolean, width: number): SidebarDisplayMode {
  if (collapsed) return "collapsed";
  if (width <= SIDEBAR_COLLAPSE_THRESHOLD) return "compact";
  if (width < SIDEBAR_NARROW_THRESHOLD) return "narrow";
  return "regular";
}

/** CSS-Klassen des aktuellen Modus. Wird auch während des Ziehens direkt am Element gesetzt. */
export function sidebarModeClassNames(collapsed: boolean, width: number): string {
  const mode = sidebarDisplayMode(collapsed, width);
  return [
    mode === "collapsed" ? "is-collapsed" : "",
    mode === "collapsed" || mode === "compact" ? "is-compact" : "",
    mode === "narrow" ? "is-narrow" : "",
  ].filter(Boolean).join(" ");
}

/**
 * Ergebnis beim Loslassen. Bis zur Mindestbreite mit Beschriftung wird
 * eingeklappt; im eingeklappten Zustand öffnet erst ein Zug über 180 px.
 * Dazwischen bleibt alles, wie es war.
 */
export function resolveSidebarPointerRelease(input: {
  liveWidth: number;
  wasCollapsed: boolean;
  lastExpandedWidth: number;
  maximum?: number;
}): SidebarLayoutState {
  const maximum = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, Math.round(input.maximum ?? SIDEBAR_WIDTH_MAX)));
  const lastWidth = Math.min(maximum, clampSidebarWidth(input.lastExpandedWidth));
  if (input.wasCollapsed) {
    if (input.liveWidth < SIDEBAR_EXPAND_THRESHOLD) return { collapsed: true, width: lastWidth };
    return { collapsed: false, width: snapSidebarWidth(input.liveWidth, SIDEBAR_EXPAND_THRESHOLD, maximum) };
  }
  if (input.liveWidth <= SIDEBAR_COLLAPSE_THRESHOLD) return { collapsed: true, width: lastWidth };
  return { collapsed: false, width: snapSidebarWidth(input.liveWidth, SIDEBAR_WIDTH_MIN, maximum) };
}

/**
 * Pfeiltasten: 8 px, mit Shift 32 px. Am unteren Rand klappt ein weiterer
 * Schritt nach links ein, statt wirkungslos zu bleiben.
 */
export function resolveSidebarKeyboardResize(input: {
  collapsed: boolean;
  width: number;
  delta: number;
  maximum?: number;
}): SidebarKeyboardResult {
  if (input.delta === 0) return null;
  const maximum = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, input.maximum ?? SIDEBAR_WIDTH_MAX));
  const rememberedWidth = Math.min(maximum, clampSidebarWidth(input.width));
  if (input.collapsed) {
    return input.delta > 0 ? { type: "expand", width: rememberedWidth } : null;
  }
  const next = input.width + input.delta;
  if (input.delta < 0 && next <= SIDEBAR_COLLAPSE_THRESHOLD) {
    return { type: "collapse" };
  }
  if (input.delta > 0) return { type: "resize", width: Math.min(maximum, clampSidebarWidth(next)) };
  return { type: "resize", width: clampSidebarWidth(next) };
}

/** Liest auch alte Stände (208 bis 360 px) und fällt bei Unsinn sicher zurück. */
export function parseSidebarLayout(raw: string | null): SidebarLayoutState {
  const fallback: SidebarLayoutState = { collapsed: false, width: SIDEBAR_WIDTH_DEFAULT };
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const candidate = parsed as { collapsed?: unknown; width?: unknown };
    if (typeof candidate.collapsed !== "boolean" || typeof candidate.width !== "number") return fallback;
    const width = clampSidebarWidth(candidate.width);
    // Alte Stände konnten genau an der Mindestbreite hängen. Dort gibt es
    // keine Beschriftungen mehr, deshalb startet die Leiste eingeklappt.
    if (!candidate.collapsed && width <= SIDEBAR_COLLAPSE_THRESHOLD) {
      return { collapsed: true, width: SIDEBAR_SNAP_POINTS[0] };
    }
    return { collapsed: candidate.collapsed, width };
  } catch {
    return fallback;
  }
}
