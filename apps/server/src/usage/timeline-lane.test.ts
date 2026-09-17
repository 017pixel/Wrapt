import { describe, expect, it } from "vitest";
import { buildTimelineLane, STALE_AFTER_MILLISECONDS } from "./timeline-service.js";

const NOW = new Date("2026-07-29T10:00:00Z");

describe("buildTimelineLane", () => {
  const now = NOW.getTime();

  it("stuft frische Daten als available ein", () => {
    const lane = buildTimelineLane({
      provider: "codex",
      managed: undefined,
      payload: { provider: "codex", usage: { accountEmail: "a@b.de", updatedAt: new Date(now).toISOString(), secondary: { usedPercent: 10, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" } } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    expect(lane.status).toBe("available");
    expect(lane.windows[0]).toEqual(expect.objectContaining({ usedPercent: 10, remainingPercent: 90 }));
  });

  it("stuft alte Daten als stale ein", () => {
    const lane = buildTimelineLane({
      provider: "codex",
      managed: undefined,
      payload: { provider: "codex", usage: { accountEmail: "a@b.de", updatedAt: new Date(now - STALE_AFTER_MILLISECONDS - 1).toISOString(), secondary: { usedPercent: 10, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" } } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    expect(lane.status).toBe("stale");
    expect(lane.error?.code).toBe("STALE_DATA");
  });

  it("stuft Payloads mit Fehler und Nutzung als partial ein", () => {
    const lane = buildTimelineLane({
      provider: "claude",
      managed: undefined,
      payload: { provider: "claude", error: { code: 1, message: "Teilweise kaputt" }, usage: { accountEmail: "a@b.de", secondary: { usedPercent: 10, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" } } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    expect(lane.status).toBe("partial");
    expect(lane.error?.message).toBe("Teilweise kaputt");
  });

  it("leitet die deterministische ID aus Provider, E-Mail oder Label ab — nicht aus Position", () => {
    const a = buildTimelineLane({
      provider: "opencode",
      managed: undefined,
      payload: { provider: "opencodego", usage: { accountEmail: "x@y.de" } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    const b = buildTimelineLane({
      provider: "opencode",
      managed: undefined,
      payload: { provider: "opencodego", usage: { accountEmail: "x@y.de" } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    expect(a.accountId).toBe(b.accountId);
    expect(a.accountId.startsWith("opencode-")).toBe(true);
  });
});
