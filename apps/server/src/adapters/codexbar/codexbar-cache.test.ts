import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageMonitoring, UsageResponse } from "@wrapt/contracts";
import { createCodexbarUsageService } from "./codexbar-cache.js";
import type { CodexbarClient } from "./codexbar-client.js";
import type { CodexbarPayload } from "./codexbar-schemas.js";

const allEnabled: UsageMonitoring = { codex: true, opencode: true, claude: true };

function usagePayload(provider: string): CodexbarPayload {
  return {
    provider,
    usage: { primary: { usedPercent: 40, windowMinutes: 300, resetsAt: "2026-07-22T10:00:00Z" } },
  };
}

function client(called: string[]): CodexbarClient {
  return {
    getUsage: async (provider: "codex" | "opencodego" | "claude") => {
      called.push(provider);
      if (provider === "codex" || provider === "opencodego") return [usagePayload(provider)];
      return [usagePayload("claude")];
    },
  } as unknown as CodexbarClient;
}

function summarize(response: UsageResponse) {
  return Object.fromEntries(response.providers.map((provider) => [provider.providerId, provider.status]));
}

describe("CodexbarUsageService mit Limitüberwachung", () => {
  it("fragt einen deaktivierten Anbieter nicht ab und meldet ihn als disabled", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({
      ttlMilliseconds: 60_000,
      client: client(called),
      monitoring: () => ({ ...allEnabled, claude: false }),
    });
    const response = await service.getUsage();
    expect(called).not.toContain("claude");
    expect(called).toContain("codex");
    expect(called).toContain("opencodego");
    expect(summarize(response)).toEqual({ codex: "available", opencode: "available", claude: "disabled" });
    expect(response.providers.find((provider) => provider.providerId === "claude")?.error?.code).toBe("MONITORING_DISABLED");
  });

  it("meldet alle Anbieter deaktiviert, ohne einen CodexBar-Fehler zu werfen", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({
      ttlMilliseconds: 60_000,
      client: client(called),
      monitoring: () => ({ codex: false, opencode: false, claude: false }),
    });
    const response = await service.getUsage();
    expect(called).toEqual([]);
    expect(summarize(response)).toEqual({ codex: "disabled", opencode: "disabled", claude: "disabled" });
  });

  it("fragt ohne Monitoring-Angabe alle Anbieter ab", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({ ttlMilliseconds: 60_000, client: client(called) });
    const response = await service.getUsage();
    expect(called.sort()).toEqual(["claude", "codex", "opencodego"]);
    expect(summarize(response)).toEqual({ codex: "available", opencode: "available", claude: "available" });
  });
});

describe("CodexbarUsageService stale-while-revalidate", () => {
  const NOW = new Date("2026-07-29T10:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("liefert einen frischen Cache ohne erneute CodexBar-Abfrage", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({ ttlMilliseconds: 60_000, client: client(called) });
    await service.getUsage();
    const first = called.length;

    const again = await service.getUsage();
    expect(called.length).toBe(first);
    expect(again.cached).toBe(true);
  });

  it("liefert nach Ablauf sofort den alten Stand und lädt im Hintergrund nach", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({ ttlMilliseconds: 60_000, client: client(called) });
    await service.getUsage();
    const first = called.length;

    await vi.advanceTimersByTimeAsync(61_000);
    const stale = await service.getUsage();
    // Sofortige Antwort mit dem bisherigen Stand, statt auf CodexBar zu warten.
    expect(stale.cached).toBe(true);
    // Der Hintergrund-Refresh läuft und ersetzt den Cache.
    await vi.advanceTimersByTimeAsync(0);
    expect(called.length).toBe(first + 3);
    const fresh = await service.getUsage();
    expect(summarize(fresh)).toEqual({ codex: "available", opencode: "available", claude: "available" });
  });

  it("invalidate startet einen Hintergrund-Refresh, während getUsage weiter den alten Stand liefert", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({ ttlMilliseconds: 60_000, client: client(called) });
    await service.getUsage();
    const first = called.length;

    service.invalidate();
    const still = await service.getUsage();
    expect(still.cached).toBe(true);

    await vi.advanceTimersByTimeAsync(0);
    expect(called.length).toBe(first + 3);
  });

  it("refresh erzwingt einen Abruf auch bei noch gültigem Cache", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({ ttlMilliseconds: 60_000, client: client(called) });
    await service.getUsage();
    const first = called.length;

    const fresh = await service.refresh();
    expect(called.length).toBe(first + 3);
    expect(fresh.cached).toBe(false);
  });

  it("aktualisiert einen abgelaufenen Cache im Hintergrund, solange der Takt läuft", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({ ttlMilliseconds: 60_000, client: client(called), refreshIntervalMilliseconds: 30_000 });
    service.start();
    await service.getUsage();
    const first = called.length;

    // Zwei Ticks: Beim zweiten ist die TTL abgelaufen, der Refresh läuft ohne Anfrage.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(called.length).toBe(first);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(called.length).toBe(first + 3);

    service.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(called.length).toBe(first + 3);
  });

  it("fragt nach einem fehlgeschlagenen Refresh nicht bei jedem Aufruf erneut ab", async () => {
    const attempts: string[] = [];
    let failing = false;
    const service = createCodexbarUsageService({
      ttlMilliseconds: 60_000,
      client: {
        getUsage: async (provider: "codex" | "opencodego" | "claude") => {
          attempts.push(provider);
          if (failing) throw new Error("CodexBar down");
          return [usagePayload(provider)];
        },
      } as unknown as CodexbarClient,
    });
    await service.getUsage();
    const afterFirstFetch = attempts.length;

    failing = true;
    service.invalidate();
    await vi.advanceTimersByTimeAsync(0);
    // Der Fehlversuch fragt die drei aktiven Anbieter genau einmal ab.
    expect(attempts.length).toBe(afterFirstFetch + 3);

    // Trotz abgelaufener TTL gilt jetzt eine Wartezeit bis zum nächsten Versuch.
    await service.getUsage();
    await service.getUsage();
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts.length).toBe(afterFirstFetch + 3);
  });

  it("benachrichtigt Abonnements nach jedem erfolgreichen Refresh", async () => {
    const service = createCodexbarUsageService({ ttlMilliseconds: 60_000, client: client([]) });
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    await service.getUsage();
    expect(listener).toHaveBeenCalledTimes(1);
    await service.refresh();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await service.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
