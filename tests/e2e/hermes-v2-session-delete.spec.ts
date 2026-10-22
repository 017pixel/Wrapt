import { expect, type Page } from "@playwright/test";
import { resourceTest as test, prepareResources, openResources, resourceWrites,
  composerInput, sessionId } from "./hermes-v2-resource-fixture";
import { otherId } from "./hermes-v2-request-fixture";
import { settleAnimations } from "./hermes-v2-work-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareResources(gateway));

async function openDelete(page: Page, id = otherId) {
  const row = page.locator(`[data-session-id="${id}"]`);
  await row.locator(".hermesv2-rowselect").click({ button: "right" });
  await page.getByRole("menuitem", { name: /^(Sitzung )?Löschen(?::.*)?$/i }).click();
  const confirmation = page.getByRole("dialog").last();
  await expect(confirmation).toContainText(id);
  return confirmation;
}

test("löscht eine andere Sitzung erst nach konkreter Kaskadenbestätigung und erhält den eigenen Entwurf", async ({ page, gateway }) => {
  await openResources(page, "Chat");
  await composerInput(page).fill("Nicht betroffener eigener Chatentwurf");
  const confirmation = await openDelete(page);
  await expect(confirmation).toContainText(/Kompressionskette/i);
  await expect(confirmation).toContainText(/delegiert|Unteraufgaben/i);
  expect(resourceWrites(gateway)).toHaveLength(0);
  await confirmation.getByRole("button", { name: /^Abbrechen$/i }).click();
  expect(gateway.stories.has(otherId)).toBe(true);
  const second = await openDelete(page);
  const absentPreview = page.waitForResponse((response) => response.url().endsWith(`/sessions/${otherId}/deletion`) && response.status() === 404);
  await second.getByRole("button", { name: /^(Sitzung )?Löschen$/i }).click();
  await expect.poll(() => gateway.stories.has(otherId)).toBe(false);
  await expect(page.locator(`[data-session-id="${otherId}"]`)).toHaveCount(0);
  await absentPreview;
  await settleAnimations(page);
  await expect(second).toContainText("Löschung nativ bestätigt.");
  await second.getByRole("button", { name: "Fertig", exact: true }).click();
  await expect(composerInput(page)).toHaveValue("Nicht betroffener eigener Chatentwurf");
  expect(gateway.stories.has(sessionId)).toBe(true);
  expect(resourceWrites(gateway)).toHaveLength(1);
  expect(resourceWrites(gateway)[0]).toMatchObject({ method: "DELETE", path: `/sessions/${otherId}`,
    body: { confirm: "delete-compression-chain" } });
});

test("erhält den Sitzungsbestand bei nativer409-Ablehnung", async ({ page, gateway }) => {
  await openResources(page, "Chat");
  const confirmation = await openDelete(page);
  gateway.resources.failNextAction = "rejected";
  await confirmation.getByRole("button", { name: /^(Sitzung )?Löschen$/i }).click();
  await expect(confirmation.getByRole("alert")).toBeVisible();
  expect(gateway.stories.has(otherId)).toBe(true);
  await expect(page.locator(`[data-session-id="${otherId}"]`)).toHaveCount(1);
  expect(resourceWrites(gateway)).toHaveLength(1);
});

test("entfernt bei verlorenem Deleteausgang keine unbestätigten Caches und wiederholt nichts", async ({ page, gateway }) => {
  await openResources(page, "Chat");
  const confirmation = await openDelete(page);
  gateway.resources.failNextAction = "unknown";
  await confirmation.getByRole("button", { name: /^(Sitzung )?Löschen$/i }).click();
  await expect(confirmation).toContainText(/unklar|unbekannt/i);
  await expect(page.locator(`[data-session-id="${otherId}"]`)).toHaveCount(1);
  expect(resourceWrites(gateway)).toHaveLength(1);
  expect(gateway.stories.has(sessionId)).toBe(true);
});
