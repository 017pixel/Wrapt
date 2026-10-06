import type { Page } from "@playwright/test";
import {
  codexResetHistoryResponseSchema,
  usageDashboardResponseSchema,
  usageResponseSchema,
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

/**
 * Live-Antwort der Statusleiste. Sie war früher leer, wodurch der Limits-Chip in
 * den E2E-Tests blind blieb. Die Werte bilden die echte CodexBar-Antwort ab:
 * zwei Accounts, einmal mit 5-Stunden- und Wochenlimit samt Guthaben, einmal nur
 * mit dem Wochenlimit — plus die beiden eingeschränkten Providerzustände.
 */
const live = usageResponseSchema.parse({
  providers: [
    {
      providerId: "codex", providerName: "Codex", status: "available", updatedAt: fetchedAt, error: null,
      accounts: [
        {
          id: "codex-1", label: "Account", email: "beckerbenjamin2010@gmail.com", plan: "plus",
          windows: [
            { id: "primary", label: "5-Stunden-Limit", usedPercent: 89, remainingPercent: 11, windowMinutes: 300, resetsAt: "2030-10-05T16:14:00Z" },
            { id: "secondary", label: "Wochenlimit", usedPercent: 49, remainingPercent: 51, windowMinutes: 10_080, resetsAt: "2030-10-11T17:38:01Z" },
          ],
          resetCredits: [
            { id: "credit-1", title: "Full reset", description: "", status: "available", grantedAt: "2026-09-22T18:45:39Z", expiresAt: "2030-11-22T18:45:39Z" },
            { id: "credit-2", title: "Full reset", description: "", status: "available", grantedAt: "2026-09-29T19:30:34Z", expiresAt: "2030-11-29T19:30:34Z" },
          ],
        },
        {
          id: "codex-2", label: "Account 2", email: "b.becker@aisci.de", plan: "plus",
          windows: [
            { id: "secondary", label: "Wochenlimit", usedPercent: 42, remainingPercent: 58, windowMinutes: 10_080, resetsAt: "2030-10-11T19:09:15Z" },
          ],
          resetCredits: [],
        },
      ],
    },
    {
      providerId: "opencode", providerName: "OpenCode Go", status: "partial", updatedAt: fetchedAt,
      error: { code: "PARTIAL_DATA", message: "Ein Teil der Nutzungsdaten ist nicht verfügbar." },
      accounts: [
        {
          id: "opencode-1", label: "Account", email: null, plan: null,
          windows: [
            { id: "primary", label: "Monatslimit", usedPercent: 48, remainingPercent: 52, windowMinutes: 43_200, resetsAt: "2030-11-23T00:00:00Z" },
          ],
          resetCredits: [],
        },
      ],
    },
    {
      providerId: "claude", providerName: "Claude Code", status: "disabled", updatedAt: null,
      error: { code: "MONITORING_DISABLED", message: "Die Limitüberwachung ist in den Einstellungen deaktiviert." },
      accounts: [],
    },
  ],
  fetchedAt,
  lastSuccessfulFetchAt: fetchedAt,
  cached: true,
});

const dashboard = usageDashboardResponseSchema.parse({
  live,
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
        : path.endsWith("/usage") ? live
          : dashboard;
    await route.fulfill({ json: response });
  });
  await page.route("**/api/v1/system/codex-reset-history", (route) => route.fulfill({ json: resetHistory }));
}
