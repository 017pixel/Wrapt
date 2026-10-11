import { describe, expect, it } from "vitest";
import { RateBudget } from "./rate-budget.js";

describe("RateBudget", () => {
  it("lässt maxEvents pro Fenster durch und blockiert danach", () => {
    const now = 0;
    const budget = new RateBudget({ maxEvents: 3, windowMilliseconds: 60_000, now: () => now });
    expect(budget.tryConsume("ident")).toBe(true);
    expect(budget.tryConsume("ident")).toBe(true);
    expect(budget.tryConsume("ident")).toBe(true);
    expect(budget.tryConsume("ident")).toBe(false);
    expect(budget.countOf("ident")).toBe(3);
  });

  it("öffnet nach Fensterablauf ein neues Budget und trennt Schlüssel", () => {
    let now = 0;
    const budget = new RateBudget({ maxEvents: 1, windowMilliseconds: 1_000, now: () => now });
    expect(budget.tryConsume("a")).toBe(true);
    expect(budget.tryConsume("a")).toBe(false);
    expect(budget.tryConsume("b")).toBe(true);
    now = 1_001;
    expect(budget.tryConsume("a")).toBe(true);
    expect(budget.countOf("a")).toBe(1);
  });
});
