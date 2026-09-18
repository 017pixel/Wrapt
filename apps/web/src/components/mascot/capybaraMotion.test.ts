import { describe, expect, it } from "vitest";
import {
  CAPYBARA_ANIMATIONS,
  buildCapybaraPartyPlan,
  capybaraActionForMotion,
  capybaraNapDelayMs,
  capybaraPhaseForHour,
  capybaraWeightsForPhase,
  pickCapybaraAction,
  planCapybaraWalk,
  type CapybaraAction,
  type CapybaraPhase,
} from "./capybaraMotion";

/** Deterministische Zufallsfolge für Verteilungstests. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("pickCapybaraAction", () => {
  it("verteilt die Aktionen über den Zufallswert", () => {
    expect(pickCapybaraAction(() => 0)).toBe("walk");
    expect(pickCapybaraAction(() => 0.5)).toBe("blink");
    expect(pickCapybaraAction(() => 0.75)).toBe("look");
    expect(pickCapybaraAction(() => 0.85)).toBe("hop");
    expect(pickCapybaraAction(() => 0.93)).toBe("sneeze");
    expect(pickCapybaraAction(() => 0.99)).toBe("doubleBlink");
  });

  it("wählt Aktionen ohne Gewicht nie aus", () => {
    for (let roll = 0; roll < 1; roll += 0.01) {
      const action = pickCapybaraAction(() => roll);
      expect(action).not.toBe("yawn");
      expect(action).not.toBe("party");
    }
  });

  it("fällt bei leerer Gewichtung auf Blinzeln zurück", () => {
    const empty = Object.fromEntries(
      Object.keys(capybaraWeightsForPhase("day")).map((key) => [key, 0]),
    ) as Record<CapybaraAction, number>;
    expect(pickCapybaraAction(() => 0.5, empty)).toBe("blink");
  });

  it("folgt der Tageszeit-Gewichtung", () => {
    const night = capybaraWeightsForPhase("night");
    const nightTotal = Object.values(night).reduce((sum, weight) => sum + weight, 0);
    const random = seededRandom(7);
    const draws = 50_000;
    let yawns = 0;
    for (let index = 0; index < draws; index += 1) {
      if (pickCapybaraAction(random, night) === "yawn") yawns += 1;
    }
    const share = yawns / draws;
    expect(share).toBeGreaterThan((night.yawn / nightTotal) * 0.9);
    expect(share).toBeLessThan((night.yawn / nightTotal) * 1.1);
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

  it("ersetzt den Partytanz, lässt das Gähnen aber zu", () => {
    expect(capybaraActionForMotion("party", true)).toBe("blink");
    expect(capybaraActionForMotion("party", false)).toBe("party");
    expect(capybaraActionForMotion("yawn", true)).toBe("yawn");
  });
});

describe("capybaraPhaseForHour", () => {
  it("ordnet die Stunden den Tageszeiten zu", () => {
    const cases: [number, CapybaraPhase][] = [
      [23, "night"], [0, "night"], [5, "night"],
      [6, "morning"], [11, "morning"],
      [12, "day"], [17, "day"],
      [18, "evening"], [22, "evening"],
    ];
    for (const [hour, phase] of cases) {
      expect(capybaraPhaseForHour(hour)).toBe(phase);
    }
  });

  it("behandelt Stunden außerhalb des Tages zyklisch", () => {
    expect(capybaraPhaseForHour(25)).toBe("night");
    expect(capybaraPhaseForHour(-1)).toBe("night");
  });

  it("wird nachts schneller müde als tagsüber", () => {
    expect(capybaraNapDelayMs("night")).toBe(90_000);
    expect(capybaraNapDelayMs("day")).toBeGreaterThan(capybaraNapDelayMs("night"));
  });

  it("feiert ein bis drei Mal pro Stunde", () => {
    // Eine Runde aus Pause (1,2–4,2 s) und Aktion dauert im Mittel rund 3,6 s,
    // also ungefähr 1000 Aktionen pro Stunde.
    const actionsPerHour = 1000;
    for (const phase of ["morning", "day", "evening"] as const) {
      const weights = capybaraWeightsForPhase(phase);
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      const partiesPerHour = (weights.party / total) * actionsPerHour;
      expect(partiesPerHour).toBeGreaterThanOrEqual(1);
      expect(partiesPerHour).toBeLessThanOrEqual(3);
    }
    expect(capybaraWeightsForPhase("night").party).toBe(0);
  });
});

describe("buildCapybaraPartyPlan", () => {
  it("tanzt mit Hut auf der Stelle und bleibt in der Spur", () => {
    const plan = buildCapybaraPartyPlan(seededRandom(3));
    expect(plan.length).toBeGreaterThanOrEqual(6);
    expect(plan[0]?.frame).toBe("party");
    expect(plan.some((step) => step.facing === "left")).toBe(true);
    expect(plan.some((step) => step.facing === "right")).toBe(true);
    const maxDelta = Math.max(...plan.map((step) => Math.abs(step.offsetDelta)));
    expect(maxDelta).toBeLessThanOrEqual(12);
    const duration = plan.reduce((sum, step) => sum + step.duration, 0);
    expect(duration).toBeGreaterThan(1_000);
    expect(duration).toBeLessThan(3_000);
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
