import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" },
  serviceWorkers: "block",
});

test("ordnet die Einstellungsbereiche und den allgemeinen Schnellzugriff", async ({ page }) => {
  await page.goto("/wrapt/settings");

  await expect(page.getByRole("searchbox", { name: "Einstellungen durchsuchen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Design", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Navigation", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start-App", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Frontend/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Backend/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Beides/ })).toBeVisible();
  await expect(page.getByText("DARK ONLY", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Alle Themes bleiben dunkel.", { exact: false })).toHaveCount(0);
});

test("findet Design über Alias und Tippfehler und springt zum Bereich", async ({ page }) => {
  await page.goto("/wrapt/settings");
  const search = page.getByRole("searchbox", { name: "Einstellungen durchsuchen" });

  await search.fill("Aussehen");
  const aliasResult = page.locator("#settings-search-results").getByRole("button", { name: /Design/ }).first();
  await expect(aliasResult).toBeVisible();
  await aliasResult.click();
  await expect(page.getByRole("button", { name: "Design", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Vorgefertigte Themes", exact: true })).toBeVisible();

  await search.fill("desgin");
  await expect(page.locator("#settings-search-results").getByRole("button", { name: /Design/ }).first()).toBeVisible();
});

test("öffnet den verschobenen Start-App-Bereich", async ({ page }) => {
  await page.goto("/wrapt/settings");
  await page.getByRole("button", { name: "Start-App", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start-App", exact: true })).toBeVisible();
  await expect(page.getByText("Welche Seite beim Öffnen von Wrapt geladen wird", { exact: true })).toBeVisible();
});

test("erreicht jeden Einstellungs-Tab und rendert seinen Fachbereich", async ({ page }) => {
  await page.goto("/wrapt/settings");
  const tabs = [
    ["Allgemein", "settings-general"],
    ["Design", "settings-design"],
    ["Navigation", "settings-navigation"],
    ["Rechtsklick", "settings-context-menu"],
    ["Benachrichtigungen", "settings-notifications"],
    ["System", "settings-system"],
    ["Erweiterungen", "settings-extensions"],
    ["Werkzeuge", "settings-usage"],
    ["Workspace", "settings-workspace"],
    ["Start-App", "settings-start-app"],
  ] as const;

  for (const [label, anchor] of tabs) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(`#${anchor}`)).toBeVisible();
  }
});
