import { describe, expect, it } from "vitest";
import { pickCapybaraAction, planCapybaraWalk } from "./capybaraMotion";

describe("pickCapybaraAction", () => {
  it("verteilt die Aktionen über den Zufallswert", () => {
    expect(pickCapybaraAction(() => 0)).toBe("walk");
    expect(pickCapybaraAction(() => 0.5)).toBe("blink");
    expect(pickCapybaraAction(() => 0.75)).toBe("look");
    expect(pickCapybaraAction(() => 0.85)).toBe("hop");
    expect(pickCapybaraAction(() => 0.99)).toBe("doubleBlink");
  });
});

describe("planCapybaraWalk", () => {
  it("bleibt ohne Platz an Ort und Stelle", () => {
    const plan = planCapybaraWalk(0, 0, () => 0.5);
    expect(plan).toEqual({ from: 0, to: 0, distance: 0 });
  });

  it("läuft von der Position aus in eine Richtung", () => {
    const plan = planCapybaraWalk(100, 400, () => 0.9);
    expect(plan.from).toBe(100);
    expect(plan.to).toBeGreaterThan(100);
    expect(plan.distance).toBe(plan.to - 100);
  });

  it("dreht am Rand die Richtung, wenn dort Platz ist", () => {
    const plan = planCapybaraWalk(10, 400, () => 0.1);
    expect(plan.from).toBe(10);
    expect(plan.to).toBe(61);
  });

  it("bleibt im erlaubten Bereich", () => {
    for (let seed = 0; seed < 1; seed += 0.05) {
      const random = () => seed;
      const plan = planCapybaraWalk(0, 60, random);
      expect(plan.to).toBeGreaterThanOrEqual(0);
      expect(plan.to).toBeLessThanOrEqual(60);
      expect(plan.from).toBeGreaterThanOrEqual(0);
    }
  });

  it("nimmt bei beidseitig fehlendem Platz den gegenüberliegenden Rand", () => {
    expect(planCapybaraWalk(5, 20, () => 0.05).to).toBe(20);
    expect(planCapybaraWalk(15, 20, () => 0.05).to).toBe(0);
  });
});
