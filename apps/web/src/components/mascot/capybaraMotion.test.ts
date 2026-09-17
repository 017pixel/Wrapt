import { describe, expect, it } from "vitest";
import {
  CAPYBARA_ANIMATIONS,
  capybaraActionForMotion,
  pickCapybaraAction,
  planCapybaraWalk,
} from "./capybaraMotion";

describe("pickCapybaraAction", () => {
  it("verteilt die Aktionen über den Zufallswert", () => {
    expect(pickCapybaraAction(() => 0)).toBe("walk");
    expect(pickCapybaraAction(() => 0.5)).toBe("blink");
    expect(pickCapybaraAction(() => 0.75)).toBe("look");
    expect(pickCapybaraAction(() => 0.85)).toBe("hop");
    expect(pickCapybaraAction(() => 0.93)).toBe("sneeze");
    expect(pickCapybaraAction(() => 0.99)).toBe("doubleBlink");
  });
});

describe("CAPYBARA_ANIMATIONS", () => {
  it("enthält vollständige, zeitlich positive Sequenzen", () => {
    Object.values(CAPYBARA_ANIMATIONS).forEach((sequence) => {
      expect(sequence.length).toBeGreaterThanOrEqual(3);
      expect(sequence.every((step) => step.duration > 0)).toBe(true);
    });
  });
});

describe("capybaraActionForMotion", () => {
  it("reduziert auch Niesen bei aktivierter Bewegungseinschränkung", () => {
    expect(capybaraActionForMotion("sneeze", true)).toBe("blink");
    expect(capybaraActionForMotion("sneeze", false)).toBe("sneeze");
  });
});

describe("planCapybaraWalk", () => {
  it("bleibt ohne Platz an Ort und Stelle", () => {
    const plan = planCapybaraWalk(0, 0, () => 0.5);
    expect(plan).toEqual({ from: 0, to: 0, distance: 0, direction: "right" });
  });

  it("läuft von der Position aus in eine Richtung", () => {
    const plan = planCapybaraWalk(100, 400, () => 0.9);
    expect(plan.from).toBe(100);
    expect(plan.to).toBeGreaterThan(100);
    expect(plan.distance).toBe(plan.to - 100);
    expect(plan.direction).toBe("right");
  });

  it("dreht am Rand die Richtung, wenn dort Platz ist", () => {
    const plan = planCapybaraWalk(10, 400, () => 0.1);
    expect(plan.from).toBe(10);
    expect(plan.to).toBe(61);
    expect(plan.direction).toBe("right");
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
    const rightPlan = planCapybaraWalk(5, 20, () => 0.05);
    const leftPlan = planCapybaraWalk(15, 20, () => 0.05);
    expect(rightPlan.to).toBe(20);
    expect(rightPlan.direction).toBe("right");
    expect(leftPlan.to).toBe(0);
    expect(leftPlan.direction).toBe("left");
  });
});
