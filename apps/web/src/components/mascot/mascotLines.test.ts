import { describe, expect, it } from "vitest";
import {
  mascotContextFrom,
  mascotLowestLimit,
  mascotMood,
  selectMascotLine,
  type MascotUsageProvider,
} from "./mascotLines";

function providers(percent: number, providerName = "Codex"): MascotUsageProvider[] {
  return [
    {
      providerName,
      status: "available",
      accounts: [{ windows: [{ remainingPercent: percent, windowMinutes: 300 }] }],
    },
  ];
}

describe("mascotContextFrom", () => {
  it("erkennt knappe Limits unterhalb der Schwelle", () => {
    const context = mascotContextFrom(providers(9), false, false);
    expect(context.lowLimit).toEqual({ provider: "Codex", percent: 9 });
    expect(mascotMood(context)).toBe("worry");
  });

  it("ignoriert unkritische, deaktivierte und unbekannte Fenster", () => {
    expect(mascotContextFrom(providers(80), false, false).lowLimit).toBeNull();
    expect(
      mascotLowestLimit([
        { providerName: "Codex", status: "disabled", accounts: [{ windows: [{ remainingPercent: 1, windowMinutes: 300 }] }] },
      ]),
    ).toBeNull();
    expect(
      mascotLowestLimit([
        { providerName: "Codex", status: "available", accounts: [{ windows: [{ remainingPercent: 1, windowMinutes: 60 }] }] },
      ]),
    ).toBeNull();
  });

  it("wählt über alle Anbieter das knappste Fenster", () => {
    const context = mascotContextFrom(
      [
        ...providers(40, "Codex"),
        ...providers(12, "Claude Code"),
        ...providers(25, "OpenCode"),
      ],
      false,
      false,
    );
    expect(context.lowLimit).toEqual({ provider: "Claude Code", percent: 12 });
  });

  it("priorisiert offline und arbeitende Arbeitsfläche", () => {
    expect(mascotMood(mascotContextFrom([], true, true))).toBe("sleep");
    expect(mascotMood(mascotContextFrom([], false, true))).toBe("work");
    expect(mascotMood(mascotContextFrom([], false, false))).toBe("calm");
  });
});

describe("selectMascotLine", () => {
  it("bevorzugt bei knappem Limit den kontextbezogenen Spruch", () => {
    const context = mascotContextFrom(providers(7), false, false);
    const line = selectMascotLine(context, () => 0.1);
    expect(line).toContain("7%");
    expect(line).toContain("Codex");
  });

  it("vermeidet direkte Wiederholungen", () => {
    const context = mascotContextFrom([], false, false);
    const first = selectMascotLine(context, () => 0);
    const second = selectMascotLine(context, () => 0, first);
    expect(second).not.toBe(first);
  });

  it("bleibt ohne Kontext generisch", () => {
    const context = mascotContextFrom([], false, false);
    expect(selectMascotLine(context, () => 0.9)).toBeTruthy();
  });
});
