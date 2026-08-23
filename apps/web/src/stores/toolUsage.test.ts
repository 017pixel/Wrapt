import { beforeEach, describe, expect, it, vi } from "vitest";
import { rankedToolIds, useToolUsage } from "./toolUsage";

beforeEach(() => {
  useToolUsage.setState({ entries: {} });
  vi.restoreAllMocks();
});

describe("Tool-Nutzung", () => {
  it("sortiert nach Öffnungen und löst Gleichstände über die letzte Nutzung", () => {
    expect(rankedToolIds({
      a: { count: 2, lastOpenedAt: 10 },
      b: { count: 4, lastOpenedAt: 5 },
      c: { count: 2, lastOpenedAt: 20 },
    }, ["a", "b", "c", "d"])).toEqual(["b", "c", "a"]);
  });

  it("zählt jede Werkzeugöffnung lokal", () => {
    vi.spyOn(Date, "now").mockReturnValue(42);
    useToolUsage.getState().record("wrapt.files.navigation.main");
    useToolUsage.getState().record("wrapt.files.navigation.main");
    expect(useToolUsage.getState().entries["wrapt.files.navigation.main"]).toEqual({
      count: 2,
      lastOpenedAt: 42,
    });
  });
});
