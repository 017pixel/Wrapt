import { describe, expect, it } from "vitest";
import type { AccountUsage, ProviderUsage, UsageWindow } from "@wrapt/contracts";
import {
  limitsCardProvider,
  limitsCardProviders,
  resetCountdown,
  windowCardLabel,
  windowLevel,
} from "./usageLimitsCard";

const now = Date.parse("2026-10-05T14:00:00Z");

function windowFixture(overrides: Partial<UsageWindow> & Pick<UsageWindow, "id">): UsageWindow {
  return {
    label: "5-Stunden-Limit",
    usedPercent: 50,
    remainingPercent: 50,
    windowMinutes: 300,
    resetsAt: "2026-10-05T16:14:00Z",
    ...overrides,
  };
}

function accountFixture(overrides: Partial<AccountUsage> = {}): AccountUsage {
  return {
    id: "codex-1",
    label: "Account",
    email: "beckerbenjamin2010@gmail.com",
    plan: "plus",
    windows: [windowFixture({ id: "primary" })],
    resetCredits: [],
    ...overrides,
  };
}

function providerFixture(overrides: Partial<ProviderUsage> = {}): ProviderUsage {
  return {
    providerId: "codex",
    providerName: "Codex",
    status: "available",
    updatedAt: "2026-10-05T13:50:45Z",
    accounts: [accountFixture()],
    error: null,
    ...overrides,
  };
}

describe("windowCardLabel", () => {
  it("übersetzt die bekannten Vertrags-Label in die Kurzform", () => {
    expect(windowCardLabel(windowFixture({ id: "primary", label: "5-Stunden-Limit" }))).toBe("5 Stunden");
    expect(windowCardLabel(windowFixture({ id: "secondary", label: "Wochenlimit" }))).toBe("7 Tage");
    expect(windowCardLabel(windowFixture({ id: "tertiary", label: "Monatslimit" }))).toBe("30 Tage");
  });

  it("leitet unbekannte Zeitfenster aus der Fensterlänge ab, statt sie zu verwerfen", () => {
    // Genau der Fall, den die alte Statusleiste auf „N % frei" fallen ließ.
    expect(windowCardLabel(windowFixture({ id: "primary", label: "Aktuelles Zeitfenster", windowMinutes: 720 }))).toBe("12 Stunden");
    expect(windowCardLabel(windowFixture({ id: "primary", label: "Aktuelles Zeitfenster", windowMinutes: 1_440 }))).toBe("1 Tag");
    expect(windowCardLabel(windowFixture({ id: "secondary", label: "Längerer Zeitraum", windowMinutes: 90 }))).toBe("90 Min");
    expect(windowCardLabel(windowFixture({ id: "secondary", label: "Längerer Zeitraum", windowMinutes: 90 * 24 * 60 }))).toBe("3 Monate");
  });

  it("rundet eine nicht glatt teilbare Länge nicht auf volle Stunden", () => {
    // 90 Minuten auf „2 Stunden" zu runden würde eine Genauigkeit vortäuschen.
    expect(windowCardLabel(windowFixture({ id: "primary", label: "Aktuelles Zeitfenster", windowMinutes: 90 }))).toBe("90 Min");
    expect(windowCardLabel(windowFixture({ id: "primary", label: "Aktuelles Zeitfenster", windowMinutes: 45 }))).toBe("45 Min");
  });

  it("rundet nur ab, wenn die Länge in der Einheit glatt aufgeht", () => {
    // 43.199 Minuten sind 29.999 Tage, nicht „29.999305555555555 Tage".
    expect(windowCardLabel(windowFixture({ id: "primary", label: "Aktuelles Zeitfenster", windowMinutes: 43_199 }))).toBe("43199 Min");
    expect(windowCardLabel(windowFixture({ id: "primary", label: "Aktuelles Zeitfenster", windowMinutes: 60 }))).toBe("1 Stunde");
    expect(windowCardLabel(windowFixture({ id: "primary", label: "Aktuelles Zeitfenster", windowMinutes: 1_500 }))).toBe("25 Stunden");
    expect(windowCardLabel(windowFixture({ id: "primary", label: "Aktuelles Zeitfenster", windowMinutes: 1_450 }))).toBe("1450 Min");
    expect(windowCardLabel(windowFixture({ id: "tertiary", label: "Zusätzliches Zeitfenster", windowMinutes: 60 * 24 * 30 * 2 }))).toBe("2 Monate");
    expect(windowCardLabel(windowFixture({ id: "tertiary", label: "Zusätzliches Zeitfenster", windowMinutes: 60 * 24 * 30 }))).toBe("1 Monat");
    expect(windowCardLabel(windowFixture({ id: "secondary", label: "Längerer Zeitraum", windowMinutes: 60 * 24 }))).toBe("1 Tag");
  });

  it("liefert bei einem Label aus dem Prototyp keinen Objektwert zurück", () => {
    // `shortLabels["__proto__"]` liefert sonst Object.prototype und das
    // Rendering bricht mit einem ungültigen React-Kind ab.
    const result = windowCardLabel(windowFixture({ id: "primary", label: "__proto__", windowMinutes: 300 }));
    expect(typeof result).toBe("string");
    expect(result).toBe("5 Stunden");
  });

  it("behält das Original-Label, wenn keine Fensterlänge bekannt ist", () => {
    expect(windowCardLabel(windowFixture({ id: "tertiary", label: "Zusätzliches Zeitfenster", windowMinutes: null }))).toBe("Zusätzliches Zeitfenster");
  });
});

describe("windowLevel", () => {
  it("bewertet den verbleibenden Anteil: viel übrig ist gut, wenig ist kritisch", () => {
    expect(windowLevel(100)).toBe("ok");
    expect(windowLevel(50)).toBe("ok");
    expect(windowLevel(49)).toBe("warn");
    expect(windowLevel(21)).toBe("warn");
    expect(windowLevel(20)).toBe("bad");
    expect(windowLevel(0)).toBe("bad");
  });
});

describe("resetCountdown", () => {
  it("formatiert Stunden und Minuten", () => {
    expect(resetCountdown("2026-10-05T16:14:00Z", now)).toBe("in 2 Std 14 Min");
    expect(resetCountdown("2026-10-05T16:00:00Z", now)).toBe("in 2 Std");
    expect(resetCountdown("2026-10-05T14:45:00Z", now)).toBe("in 45 Min");
  });

  it("formatiert Tage und Stunden", () => {
    expect(resetCountdown("2026-10-06T20:00:00Z", now)).toBe("in 1 Tag 6 Std");
    expect(resetCountdown("2026-10-06T14:00:00Z", now)).toBe("in 1 Tag");
    // Ab drei Tagen bleibt nur die Tagesangabe — die Stunde wäre bedeutungslos.
    expect(resetCountdown("2026-10-11T17:38:01Z", now)).toBe("in 6 Tagen");
    expect(resetCountdown("2026-10-09T14:00:00Z", now)).toBe("in 4 Tagen");
  });

  it("liefert null bei fehlendem, ungültigem oder vergangenem Reset", () => {
    expect(resetCountdown(null, now)).toBeNull();
    expect(resetCountdown("kein-datum", now)).toBeNull();
    expect(resetCountdown("2026-10-05T13:30:00Z", now)).toBeNull();
    expect(resetCountdown("2026-10-05T14:00:00Z", now)).toBeNull();
  });
});

describe("limitsCardProvider", () => {
  it("bildet echte Codex-Daten mit 5 Stunden, 7 Tagen und Guthaben ab", () => {
    const provider = limitsCardProvider(providerFixture({
      accounts: [accountFixture({
        windows: [
          windowFixture({ id: "primary", label: "5-Stunden-Limit", usedPercent: 89, remainingPercent: 11, resetsAt: "2026-10-05T14:39:18Z" }),
          windowFixture({ id: "secondary", label: "Wochenlimit", windowMinutes: 10_080, usedPercent: 49, remainingPercent: 51, resetsAt: "2026-10-11T17:38:01Z" }),
        ],
        resetCredits: [
          { id: "c1", title: "Full reset", description: "", status: "available", grantedAt: "2026-09-22T18:45:39Z", expiresAt: "2026-10-22T18:45:39Z" },
          { id: "c2", title: "Full reset", description: "", status: "available", grantedAt: "2026-09-29T19:30:34Z", expiresAt: "2026-10-29T19:30:34Z" },
        ],
      })],
    }), now);

    expect(provider.tone).toBe("info");
    expect(provider.note).toBeNull();
    expect(provider.accounts[0]?.windows).toEqual([
      { key: "primary", label: "5 Stunden", remainingPercent: 11, level: "bad", resetsIn: "in 39 Min" },
      { key: "secondary", label: "7 Tage", remainingPercent: 51, level: "ok", resetsIn: "in 6 Tagen" },
    ]);
    expect(provider.accounts[0]?.credits).toEqual({ count: 2, expiresOn: "22. Okt." });
  });

  it("findet das früheste Ablaufdatum trotz gemischter Zeitzonen", () => {
    // Lexikografisch sortierte ISO-Strings wählen hier das falsche Datum:
    // "2026-11-06T00:30+14:00" ist früher als "2026-11-05T23:30-12:00", weil
    // der erste Wert nur 12. November 23:30 UTC entspricht.
    const provider = limitsCardProvider(providerFixture({
      accounts: [accountFixture({
        resetCredits: [
          { id: "spaet", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: "2026-11-05T23:30:00-12:00" },
          { id: "frueh", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: "2026-11-06T00:30:00+14:00" },
        ],
      })],
    }), now);

    // Der frühere Wert ist der 5. November 10:30 UTC.
    expect(provider.accounts[0]?.credits).toEqual({ count: 2, expiresOn: "5. Nov." });
  });

  it("zeigt nur das früheste Ablaufdatum und zählt nur einlösbare Guthaben", () => {
    const provider = limitsCardProvider(providerFixture({
      accounts: [accountFixture({
        resetCredits: [
          { id: "used", title: "Full reset", description: "", status: "consumed", grantedAt: null, expiresAt: null },
          { id: "later", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: "2026-10-29T17:03:16Z" },
          { id: "sooner", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: "2026-10-22T18:51:58Z" },
        ],
      })],
    }), now);

    expect(provider.accounts[0]?.credits).toEqual({ count: 2, expiresOn: "22. Okt." });
  });

  it("zählt abgelaufene Guthaben nicht, auch wenn CodexBar sie als verfügbar meldet", () => {
    // CodexBar liefert abgelaufene Einträge teils weiter mit status "available".
    const provider = limitsCardProvider(providerFixture({
      accounts: [accountFixture({
        resetCredits: [
          { id: "abgelaufen", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: "2026-09-01T00:00:00Z" },
          { id: "gueltig", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: "2026-12-01T00:00:00Z" },
        ],
      })],
    }), now);

    expect(provider.accounts[0]?.credits).toEqual({ count: 1, expiresOn: "1. Dez." });
  });

  it("zeigt nur dann keine Guthaben, wenn alle abgelaufen oder verbraucht sind", () => {
    const provider = limitsCardProvider(providerFixture({
      accounts: [accountFixture({
        resetCredits: [
          { id: "a", title: "Full reset", description: "", status: "consumed", grantedAt: null, expiresAt: null },
          { id: "b", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: "2026-09-01T00:00:00Z" },
        ],
      })],
    }), now);

    expect(provider.accounts[0]?.credits).toBeNull();
  });

  it("behandelt ein Guthaben ohne Ablaufdatum als unbefristet", () => {
    const provider = limitsCardProvider(providerFixture({
      accounts: [accountFixture({
        resetCredits: [{ id: "ohne", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: null }],
      })],
    }), now);

    expect(provider.accounts[0]?.credits).toEqual({ count: 1, expiresOn: null });
  });

  it("lässt die Guthaben-Zeile weg, wenn es keine gibt", () => {
    const opencode = limitsCardProvider(providerFixture({
      providerId: "opencode",
      providerName: "OpenCode Go",
      accounts: [accountFixture({
        email: null,
        plan: null,
        windows: [windowFixture({ id: "primary", label: "Monatslimit", windowMinutes: 43_200, usedPercent: 48, resetsAt: "2026-10-23T00:00:00Z" })],
      })],
    }), now);

    expect(opencode.tone).toBe("ok");
    expect(opencode.accounts[0]?.credits).toBeNull();
    expect(opencode.accounts[0]?.identity).toBe("Account");
  });

  it("ordnet die vier Problemzustände einer neutralen Zeile zu", () => {
    const cases: Array<[Partial<ProviderUsage>, string]> = [
      [{ status: "disabled" }, "Überwachung in den Einstellungen aus"],
      [{ status: "unavailable" }, "Keine Nutzungsdaten verfügbar"],
      [{ status: "partial" }, "Teilweise Daten — nicht alle Konten lesbar"],
      [{ status: "available", accounts: [accountFixture({ windows: [] })] }, "Keine Limitfenster gemeldet"],
    ];
    for (const [overrides, expected] of cases) {
      const provider = limitsCardProvider(providerFixture(overrides), now);
      expect(provider.note).toBe(expected);
      expect(provider.tone).toBe("neutral");
    }
  });

  it("behält einen Account ohne 5-Stunden-Fenster bei seinen vorhandenen Zeiträumen", () => {
    // Echter Fall: der zweite Codex-Account meldet nur das Wochenlimit.
    const provider = limitsCardProvider(providerFixture({
      accounts: [accountFixture({
        email: "b.becker@aisci.de",
        windows: [windowFixture({ id: "secondary", label: "Wochenlimit", windowMinutes: 10_080, usedPercent: 42, resetsAt: "2026-10-11T19:09:15Z" })],
      })],
    }), now);

    expect(provider.accounts[0]?.windows).toHaveLength(1);
    expect(provider.accounts[0]?.windows[0]?.label).toBe("7 Tage");
  });
});

describe("limitsCardProviders", () => {
  it("folgt der Registry-Reihenfolge und nimmt deren sprechenden Titel", () => {
    const providers = limitsCardProviders(
      [
        providerFixture({ providerId: "claude", providerName: "Claude Code", accounts: [] }),
        providerFixture({ providerId: "codex" }),
      ],
      [
        { providerId: "codex", title: "Codex" },
        { providerId: "opencode", title: "OpenCode" },
        { providerId: "claude", title: "Claude Code" },
      ],
      now,
    );

    expect(providers.map((provider) => provider.providerId)).toEqual(["codex", "claude"]);
    expect(providers[0]?.name).toBe("Codex");
  });

  it("überspringt Provider ohne Serverdaten", () => {
    expect(limitsCardProviders([], [{ providerId: "codex", title: "Codex" }], now)).toEqual([]);
  });
});