import { expect, test, type Locator } from "@playwright/test";
import { workbenchUrl } from "./helpers/environment";
import { mockUsageData, scarceAccountLabel } from "./helpers/usage";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  serviceWorkers: "block",
  viewport: { width: 1440, height: 960 },
});

test.beforeEach(async ({ page }) => {
  await mockUsageData(page);
});

async function expectNoHorizontalOverflow(locator: Locator): Promise<void> {
  const width = await locator.evaluate((element) => {
    const boundary = element.getBoundingClientRect();
    const outside = [...element.querySelectorAll("*")]
      .filter((child) => child.getBoundingClientRect().right > boundary.right + 1)
      .slice(0, 8)
      .map((child) => ({ element: child.tagName, class: child.getAttribute("class"), right: child.getBoundingClientRect().right }));
    return { client: element.clientWidth, scroll: element.scrollWidth, outside };
  });
  expect.soft(width.scroll, JSON.stringify(width.outside)).toBeLessThanOrEqual(width.client + 1);
}

test("zeigt aktuelle Demo-Limits und erklärt fehlende Daten im Detaildialog", async ({ page }) => {
  await page.goto(`${workbenchUrl}/usage`);
  await expect(page.getByRole("heading", { name: "Nutzung und Limits" })).toBeVisible();
  const table = page.getByRole("table", { name: "Aktuelle Limits je Account" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("button", { name: /Details$/ })).toHaveCount(4);
  await expect(table.getByText("75 %", { exact: true })).toBeVisible();
  await expect(table.getByText("15 %", { exact: true })).toBeVisible();
  await expect(table.getByText("Keine Limitdaten", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Zusammenfassung der Limits")).toContainText("4 Accounts · 1 niedrig");

  await table.getByRole("button", { name: "Demo Ohne Daten Details" }).click();
  const details = page.getByRole("dialog", { name: "Demo Ohne Daten · Limits" });
  await expect(details.getByText("Nicht verfügbar", { exact: true })).toBeVisible();
  await expect(details.getByText("Für das Demokonto sind keine Limitdaten verfügbar.")).toBeVisible();
  await expect(details.getByText("Für diesen Account liegen keine Limitfenster vor.")).toBeVisible();
  await details.getByRole("button", { name: "Dialog schließen" }).click();
  await expect(details).toBeHidden();
});

test("kombiniert Problemfilter und ausgeblendete Accounts und stellt die Liste wieder her", async ({ page }) => {
  await page.goto(`${workbenchUrl}/usage`);
  const table = page.getByRole("table", { name: "Aktuelle Limits je Account" });
  await expect(table).toBeVisible();
  await page.getByRole("button", { name: "Nur problematische" }).click();
  await expect(table.getByRole("button", { name: /Details$/ })).toHaveCount(2);
  await page.getByRole("button", { name: "Ohne Daten ausblenden" }).click();
  await expect(table.getByRole("button", { name: /Details$/ })).toHaveCount(1);
  await expect(table.getByRole("button", { name: `${scarceAccountLabel} Details` })).toBeVisible();

  await page.getByRole("button", { name: "Accounts ausblenden", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Accounts ausblenden" });
  await picker.getByRole("checkbox", { name: new RegExp(scarceAccountLabel) }).uncheck();
  await expect(table).toHaveCount(0);
  await expect(page.getByText("Keine Accounts entsprechen den gewählten Filtern.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(table.getByRole("button", { name: /Details$/ })).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Nur problematische" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Ohne Daten ausblenden" })).toHaveAttribute("aria-pressed", "false");
});

test("hält Limits, Detaildialog und Filter auf einem kleinen Display bedienbar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${workbenchUrl}/usage`);
  const table = page.getByRole("table", { name: "Aktuelle Limits je Account" });
  await expect(table).toBeVisible();
  await expectNoHorizontalOverflow(table);

  await table.getByRole("button", { name: `${scarceAccountLabel} Details` }).click();
  const details = page.getByRole("dialog", { name: `${scarceAccountLabel} · Limits` });
  await expect(details.getByText("15 % verbleibend")).toBeVisible();
  await expectNoHorizontalOverflow(details);
  await details.getByRole("button", { name: "Dialog schließen" }).click();
  await expect(details).toBeHidden();

  await page.getByRole("button", { name: "Filter", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filter und Sortierung" });
  await expect(filters).toBeVisible();
  await expectNoHorizontalOverflow(filters);
  await filters.getByRole("combobox", { name: "Provider", exact: true }).selectOption("claude");
  await filters.getByRole("button", { name: "Filter schließen" }).click();
  await expect(filters).toBeHidden();
  await expect(table.getByRole("button", { name: /Details$/ })).toHaveCount(1);
  await expect(table.getByRole("button", { name: "Demo Claude Details" })).toBeVisible();
  await expectNoHorizontalOverflow(page.locator(".usage-page"));
});
