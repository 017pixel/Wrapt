/**
 * Mausrad-Steuerung für horizontal scrollbare Tab-Leisten.
 * Ein normales Mausrad liefert nur `deltaY`; über der Leiste wird daraus ein
 * horizontaler Scroll. Am Anfang und Ende bleibt das Standardverhalten erhalten,
 * damit die Seite weiter vertikal scrollt.
 */
export interface TabScrollTarget {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}

export const TAB_WHEEL_LINE_HEIGHT = 40;
export const TAB_WHEEL_PAGE_RATIO = 0.9;

export function scrollTabsByWheel(
  target: TabScrollTarget,
  deltaX: number,
  deltaY: number,
  deltaMode = 0,
): boolean {
  const maxScroll = target.scrollWidth - target.clientWidth;
  if (maxScroll <= 0) return false;

  const raw = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  const factor = deltaMode === 1
    ? TAB_WHEEL_LINE_HEIGHT
    : deltaMode === 2
      ? target.clientWidth * TAB_WHEEL_PAGE_RATIO
      : 1;
  const delta = raw * factor;
  if (delta === 0) return false;

  if (delta < 0 && target.scrollLeft <= 0) return false;
  if (delta > 0 && target.scrollLeft >= maxScroll) return false;

  target.scrollLeft = Math.min(maxScroll, Math.max(0, target.scrollLeft + delta));
  return true;
}
