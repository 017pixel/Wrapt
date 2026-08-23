import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexResetHistoryService } from "./codexResetHistoryService.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function configDirectory(enabled: boolean): string {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-codex-reset-history-"));
  directories.push(directory);
  const config = JSON.parse(readFileSync(join(repositoryRoot, "config/wrapt.example.json"), "utf8")) as Record<string, unknown>;
  config.usage = { ...(config.usage as Record<string, unknown>), codexResetHistory: { enabled } };
  writeFileSync(join(directory, "wrapt.local.json"), `${JSON.stringify(config)}\n`, "utf8");
  return directory;
}

const bankedReset = {
  id: "reset-banked",
  reset_type: "banked" as const,
  announced_at: "2026-08-21T11:43:19Z",
  text: "Banked reset announced",
  source: { url: "https://x.com/thsottiaux/status/123" },
};

const regularReset = {
  id: "reset-regular",
  reset_type: "regular" as const,
  announced_at: "2026-08-14T10:00:00Z",
  text: "Regular reset announced",
  source: { url: "https://x.com/thsottiaux/status/122" },
};

function fetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/status")) {
      return new Response(JSON.stringify({ data: {
        latest_reset: bankedReset,
        stats: { total: 2, last_reset_at: bankedReset.announced_at, days_since_last: 0.5, avg_interval_days: 7.7 },
      } }));
    }
    return new Response(JSON.stringify({ data: [bankedReset, regularReset], pagination: { limit: 20, offset: 0, total: 2 }, meta: {} }));
  });
}

describe("CodexResetHistoryService", () => {
  it("bleibt standardmäßig deaktiviert und fragt die externe API nicht ab", async () => {
    const fetchImplementation = fetchMock();
    const service = new CodexResetHistoryService({ configDirectory: configDirectory(false), fetchImplementation: fetchImplementation as unknown as typeof fetch });

    await expect(service.get()).resolves.toMatchObject({ enabled: false, status: "disabled", resets: [] });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("lädt Status und Reset-Liste, bildet die API auf den lokalen Vertrag ab und cached sie", async () => {
    const fetchImplementation = fetchMock();
    const service = new CodexResetHistoryService({ configDirectory: configDirectory(true), fetchImplementation: fetchImplementation as unknown as typeof fetch });

    const result = await service.get();
    expect(result).toMatchObject({ enabled: true, status: "available", stats: { total: 2, averageIntervalDays: 7.7 } });
    expect(result.resets).toEqual([
      { id: "reset-banked", resetType: "banked", announcedAt: bankedReset.announced_at, text: bankedReset.text, sourceUrl: bankedReset.source.url },
      { id: "reset-regular", resetType: "regular", announcedAt: regularReset.announced_at, text: regularReset.text, sourceUrl: regularReset.source.url },
    ]);
    await service.get();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("zeigt bei einem späteren API-Fehler den letzten erfolgreichen Stand als stale", async () => {
    const fetchImplementation = fetchMock();
    const service = new CodexResetHistoryService({ configDirectory: configDirectory(true), fetchImplementation: fetchImplementation as unknown as typeof fetch });
    await service.get();
    service.invalidate();
    fetchImplementation.mockImplementation(async () => { throw new Error("offline"); });

    const result = await service.get();
    expect(result).toMatchObject({ enabled: true, status: "stale", error: "offline" });
    expect(result.resets[0]).toMatchObject({ id: "reset-banked" });
  });
});
