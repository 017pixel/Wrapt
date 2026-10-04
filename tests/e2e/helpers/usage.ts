import type { Page } from "@playwright/test";
import {
  codexResetHistoryResponseSchema,
  usageDashboardResponseSchema,
  usageSyncStatusSchema,
  usageTimelineLaneSchema,
  usageTimelineResponseSchema,
} from "../../../packages/contracts/src/index";

export const scarceAccountLabel = "Knappes Demokonto mit langem Namen für die mobile Ansicht";
const fetchedAt = "2026-10-02T12:00:00Z";

function account(accountId: string, accountLabel: string, remainingPercent: number, overrides: Record<string, unknown> = {}) {
  return usageTimelineLaneSchema.parse({
    providerId: "codex", accountId, accountLabel, email: null, plan: null, active: false,
    windows: [{ id: "secondary", label: "Wochenlimit", remainingPercent, usedPercent: 100 - remainingPercent, windowMinutes: 10_080, resetsAt: "2030-10-05T12:00:00Z" }],
    resetCredits: [], status: "available", error: null, updatedAt: fetchedAt,
    ...overrides,
  });
}

const timeline = usageTimelineResponseSchema.parse({
  lanes: [
    account("demo-gesund", "Demo Gesund", 75, { active: true }),
    account("demo-knapp", scarceAccountLabel, 15),
    account("demo-claude", "Demo Claude", 50, { providerId: "claude" }),
    account("demo-ohne-daten", "Demo Ohne Daten", 0, {
      providerId: "opencode", windows: [], status: "unavailable", updatedAt: null,
      error: { code: "NO_USAGE_DATA", message: "Für das Demokonto sind keine Limitdaten verfügbar." },
    }),
  ],
  fetchedAt,
  lastSuccessfulFetchAt: fetchedAt,
});

const dashboard = usageDashboardResponseSchema.parse({
  live: { providers: [], fetchedAt, lastSuccessfulFetchAt: fetchedAt, cached: true },
  range: "30d", daily: [], projects: [], projectRange: "all", models: [], forecasts: [], resetCredits: {},
  totals: { totalTokens: 0, totalCost: 0, todayTokens: 0, projected30DayTokens: 0, projected30DayCost: 0 },
  historyStartedAt: null,
});

const syncStatus = usageSyncStatusSchema.parse({ running: false, liveRunning: false, lastCompletedAt: fetchedAt });
const resetHistory = codexResetHistoryResponseSchema.parse({
  enabled: false, status: "disabled", resets: [],
  stats: { total: 0, lastResetAt: null, daysSinceLast: null, averageIntervalDays: null },
  fetchedAt: null, lastSuccessfulFetchAt: null, error: null,
});

/** Auch der automatische Sync bleibt in der Fixture und startet keine Anbieter-Abfrage. */
export async function mockUsageData(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/usage(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const response = path.endsWith("/timeline") ? timeline
      : path.endsWith("/sync/status") ? syncStatus
        : path.endsWith("/usage") ? dashboard.live : dashboard;
    await route.fulfill({ json: response });
  });
  await page.route("**/api/v1/system/codex-reset-history", (route) => route.fulfill({ json: resetHistory }));
}
