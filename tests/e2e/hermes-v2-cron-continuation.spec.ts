import { expect } from "@playwright/test";
import { resourceTest as test, prepareResources, openResources, selectCron, composerInput,
  resourceWrites } from "./hermes-v2-resource-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareResources(gateway));

test("setzt einen belegten Cron-Lauf im Chat fort, ohne den Job erneut zu starten", async ({ page, context, gateway }) => {
  const sessionId = "cron_own-cron_20261026";
  gateway.seed(sessionId, "Fortsetzung des Cron-Laufs");
  gateway.seedHistory(sessionId, 2);
  gateway.composer.seed(sessionId);
  await context.route("**/api/v1/hermes/v2/cron/jobs/own-cron/runs*", (route) => route.fulfill({ json: {
    scope: gateway.resources.scope, jobId: "own-cron", truncated: false,
    runs: [{ id: sessionId, sessionId, startedAt: 1_800_000_000_000, status: "completed",
      text: "Eigener abgeschlossener Browserlauf", truncated: false }],
  } }));
  await openResources(page);
  await selectCron(page);
  await page.getByRole("button", { name: "Im Chat fortsetzen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fortsetzung des Cron-Laufs", exact: true })).toBeVisible();
  await expect(composerInput(page)).toBeEnabled();
  await expect(page.getByRole("log", { name: "Chatverlauf" })).toContainText("Gespeicherte Nachricht 2");
  await composerInput(page).fill("Bitte erkläre das Ergebnis.");
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(page.getByRole("log", { name: "Chatverlauf" })).toContainText("Native Antwort aus dem Browser-Test.");
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toEqual([
    { op: "message.submit", sessionId, mode: "normal" },
  ]);
  expect(resourceWrites(gateway)).toEqual([]);
});

test("bietet reine Skriptausgaben ohne Session nicht als Chat an", async ({ page }) => {
  await openResources(page);
  await selectCron(page);
  await expect(page.getByText("Eigener abgeschlossener Browserlauf", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Im Chat fortsetzen", exact: true })).toHaveCount(0);
});
