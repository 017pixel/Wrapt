import type { UsageTimelineLane as ApiTimelineLane, UsageTimelineStatus, UsageWindow } from "@wrapt/contracts";

/** Account-Limits und Reset-Zeitpunkte aus den bestehenden Usage-Daten. */
export interface TimelineLimit {
  label: string;
  remaining: number;
}

export interface TimelineResetCredit {
  id: string;
  grantedAtMs: number | null;
  expiresAtMs: number;
}

/** Eine Account-Zeile der Timeline, abgeleitet aus den bestehenden Usage-Daten. */
export interface TimelineLane {
  providerId: "codex" | "claude" | "opencode";
  accountId: string;
  accountLabel: string;
  email: string | null;
  plan: string | null;
  active: boolean;
  status: UsageTimelineStatus;
  error: { code: string; message: string } | null;
  /** Bekannter Reset-Zeitpunkt (Fensterende); alle Grenzen leiten sich davon ab. */
  anchorMs: number | null;
  /** Fensterlänge in Stunden. */
  periodHours: number | null;
  /** Verbleibender Prozentsatz des aktuell gemessenen Fensters. */
  remaining: number | null;
  limits: TimelineLimit[];
  resetCredits: TimelineResetCredit[];
  updatedAt: string | null;
}

/**
 * Wählt das Fenster, aus dem eine Lane gezeichnet wird: das längste, das in
 * den sichtbaren Bereich passt; bei Gleichstand das mit dem frühesten Reset.
 * Passt nichts, wird das kürzeste verfügbare Fenster genutzt, statt nichts zu
 * zeichnen. Ohne Reset-Zeitpunkt gibt es keinen Anker — dann wird nicht geraten.
 */
export function pickLaneWindow<T extends { resetAtMs?: number | null; periodHours?: number | null }>(windows: readonly T[], maxPeriodHours?: number): T | null {
  const usable = windows.filter((window) => typeof window.resetAtMs === "number" && Number.isFinite(window.resetAtMs));
  if (usable.length === 0) return null;

  const periodOf = (window: T) => (typeof window.periodHours === "number" && window.periodHours > 0 ? window.periodHours : 0);

  const fitting = maxPeriodHours === undefined ? usable : usable.filter((window) => periodOf(window) <= maxPeriodHours);

  const pool = fitting.length > 0 ? fitting : usable;
  return pool.reduce((best, window) => {
    const byPeriod = periodOf(window) - periodOf(best);
    if (byPeriod !== 0) return byPeriod > 0 ? window : best;
    return (window.resetAtMs as number) < (best.resetAtMs as number) ? window : best;
  });
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

interface ApiWindowLike extends UsageWindow {
  resetsAt: string | null;
  windowMinutes: number | null;
}

/**
 * Baut eine Timeline-Lane aus einer API-Lane. Semantik der bestehenden
 * UsageWindow-Struktur: `remainingPercent` ist verbleibend, `usedPercent`
 * verbraucht. Der Anker ist der Reset des gewählten Fensters; der angezeigte
 * `remaining` Wert stammt ausschließlich aus dem Fenster des API-Status.
 */
export function buildTimelineLane(lane: ApiTimelineLane, maxPeriodHours?: number): TimelineLane {
  const windows: Array<ApiWindowLike & { periodHours: number | null; resetAtMs: number | null }> = lane.windows.map((window) => ({
    ...window,
    periodHours: window.windowMinutes === null ? null : window.windowMinutes / 60,
    resetAtMs: window.resetsAt ? Date.parse(window.resetsAt) : null,
  }));

  const chosen = pickLaneWindow(windows, maxPeriodHours);

  return {
    providerId: lane.providerId,
    accountId: lane.accountId,
    accountLabel: lane.accountLabel,
    email: lane.email,
    plan: lane.plan,
    active: lane.active,
    status: lane.status,
    error: lane.error,
    anchorMs: chosen?.resetAtMs ?? null,
    periodHours: chosen?.periodHours ?? null,
    remaining: chosen?.remainingPercent !== undefined && chosen !== null ? clampPercent(chosen.remainingPercent) : null,
    limits: lane.windows
      .filter((window) => window.remainingPercent !== undefined)
      .map((window) => ({ label: window.label, remaining: clampPercent(window.remainingPercent) })),
    resetCredits: lane.resetCredits
      .filter((credit) => credit.status.toLowerCase() === "available" && credit.expiresAt !== null)
      .map((credit) => {
        const expiresAtMs = Date.parse(credit.expiresAt!);
        if (!Number.isFinite(expiresAtMs)) return null;
        const grantedAtMs = credit.grantedAt ? Date.parse(credit.grantedAt) : NaN;
        return {
          id: credit.id,
          grantedAtMs: Number.isFinite(grantedAtMs) ? grantedAtMs : null,
          expiresAtMs,
        };
      })
      .filter((credit): credit is TimelineResetCredit => credit !== null),
    updatedAt: lane.updatedAt,
  };
}
