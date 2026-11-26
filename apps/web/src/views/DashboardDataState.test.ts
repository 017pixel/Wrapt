import { afterEach, describe, expect, it, vi } from "vitest";
import { isDashboardDataStale } from "./DashboardDataState";
import type { DashboardQuery } from "./DashboardPanels";

function query<T>(overrides: Partial<DashboardQuery<T>>): DashboardQuery<T> {
  return { data: undefined, dataUpdatedAt: Date.now(), ...overrides } as unknown as DashboardQuery<T>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isDashboardDataStale", () => {
  it("frische Daten gelten nicht als veraltet", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(isDashboardDataStale(query({ data: { ok: true }, dataUpdatedAt: Date.now() }), 5_000)).toBe(false);
  });

  it("zu alte Daten gelten als veraltet", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const dataUpdatedAt = Date.now() - 10_001;
    expect(isDashboardDataStale(query({ data: { ok: true }, dataUpdatedAt }), 5_000)).toBe(true);
  });

  it("fehlgeschlagene Aktualisierung mit alten Daten gilt als veraltet", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(isDashboardDataStale(query({
      data: { ok: true },
      dataUpdatedAt: Date.now(),
      isError: true,
    }), 5_000)).toBe(true);
  });

  it("ohne Daten und ohne Intervall gilt nichts als veraltet", () => {
    expect(isDashboardDataStale(query({}), 5_000)).toBe(false);
    expect(isDashboardDataStale(query({ data: { ok: true } }), undefined)).toBe(false);
  });
});
