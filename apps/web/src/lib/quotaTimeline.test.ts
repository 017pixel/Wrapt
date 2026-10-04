import { describe, expect, it } from "vitest";
import { buildTimelineLane, pickLaneWindow } from "./quotaTimeline";

function apiLane(over: Partial<Parameters<typeof buildTimelineLane>[0]> = {}): Parameters<typeof buildTimelineLane>[0] {
  return {
    providerId: "codex",
    accountId: "codex-1",
    accountLabel: "Privat",
    email: "privat@example.com",
    plan: "plus",
    active: true,
    windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 60, remainingPercent: 40, windowMinutes: 10_080, resetsAt: "2026-07-19T20:00:00Z" }],
    resetCredits: [],
    status: "available",
    error: null,
    updatedAt: "2026-07-19T10:00:00Z",
    ...over,
  } as Parameters<typeof buildTimelineLane>[0];
}

describe("pickLaneWindow", () => {
  it("ignoriert Fenster ohne Reset-Zeitpunkt", () => {
    const chosen = pickLaneWindow<{ resetAtMs?: number | null; periodHours?: number | null }>([
      { resetAtMs: null, periodHours: 168 },
      { resetAtMs: 1000, periodHours: 5 },
      { periodHours: 168 },
    ]);
    expect(chosen?.resetAtMs).toBe(1000);
  });

  it("bevorzugt das längste Fenster, das in die Spanne passt, nicht den frühesten Reset", () => {
    const fiveHour = { resetAtMs: 1_000, periodHours: 5 };
    const weekly = { resetAtMs: 9_000, periodHours: 168 };
    expect(pickLaneWindow([fiveHour, weekly], 14 * 24)).toBe(weekly);
    expect(pickLaneWindow([fiveHour, weekly], 3 * 24)).toBe(fiveHour);
  });

  it("bricht Gleichstände über den frühesten Reset", () => {
    const later = { resetAtMs: 9_000, periodHours: 168 };
    const sooner = { resetAtMs: 5_000, periodHours: 168 };
    expect(pickLaneWindow([later, sooner], 14 * 24)).toBe(sooner);
  });

  it("fällt auf das kürzeste verfügbare Fenster zurück statt nichts zu zeichnen", () => {
    const monthly = { resetAtMs: 5_000, periodHours: 720 };
    expect(pickLaneWindow([monthly], 3 * 24)).toBe(monthly);
  });

  it("liefert null, wenn nichts passt", () => {
    expect(pickLaneWindow([{ resetAtMs: null }])).toBeNull();
    expect(pickLaneWindow([])).toBeNull();
  });
});

describe("buildTimelineLane", () => {
  it("verankert am spannengerechten Fenster und leitet remaining aus remainingPercent ab", () => {
    const soon = new Date("2026-07-19T20:00:00Z").getTime();
    const later = new Date("2026-07-22T20:00:00Z").getTime();
    const api = apiLane({
      windows: [
        { id: "primary", label: "5-Stunden-Limit", usedPercent: 20, remainingPercent: 80, windowMinutes: 300, resetsAt: "2026-07-19T20:00:00Z" },
        { id: "secondary", label: "Wochenlimit", usedPercent: 60, remainingPercent: 40, windowMinutes: 10_080, resetsAt: "2026-07-22T20:00:00Z" },
      ],
    });
    const weekly = buildTimelineLane(api, 14 * 24);
    expect(weekly.anchorMs).toBe(later);
    expect(weekly.periodHours).toBe(168);
    expect(weekly.remaining).toBe(40);
    const session = buildTimelineLane(api, 3 * 24);
    expect(session.anchorMs).toBe(soon);
    expect(session.periodHours).toBe(5);
    expect(session.remaining).toBe(80);
    expect(weekly.limits).toEqual([
      { label: "5-Stunden-Limit", remaining: 80 },
      { label: "Wochenlimit", remaining: 40 },
    ]);
  });

  it("nimmt verfügbare Reset-Credits mit parsebarem Ablaufdatum auf", () => {
    const expiresAt = "2026-08-02T12:00:00Z";
    const built = buildTimelineLane(
      apiLane({
        resetCredits: [
          { id: "credit-1", title: "Full reset", description: "", status: "available", grantedAt: "2026-07-01T12:00:00Z", expiresAt },
          { id: "spent", title: "Full reset", description: "", status: "consumed", grantedAt: "2026-07-01T12:00:00Z", expiresAt },
          { id: "invalid", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: null },
        ],
      }),
    );
    expect(built.resetCredits).toEqual([
      { id: "credit-1", grantedAtMs: new Date("2026-07-01T12:00:00Z").getTime(), expiresAtMs: new Date(expiresAt).getTime() },
    ]);
  });

  it("Fenster ohne Reset-Zeitpunkt verankern die Lane nicht", () => {
    const built = buildTimelineLane(apiLane({ windows: [{ id: "primary", label: "5-Stunden-Limit", usedPercent: 50, remainingPercent: 50, windowMinutes: 300, resetsAt: null }] }));
    expect(built.anchorMs).toBeNull();
  });

  it("behält die Prozent-Semantik: remainingPercent ist verbleibend", () => {
    const built = buildTimelineLane(apiLane({ windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 93, remainingPercent: 7, windowMinutes: 10_080, resetsAt: "2026-07-22T20:00:00Z" }] }));
    expect(built.remaining).toBe(7);
    expect(built.limits[0]).toEqual({ label: "Wochenlimit", remaining: 7 });
  });
});
