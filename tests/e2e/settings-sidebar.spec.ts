import { expect, test, type Page } from "@playwright/test";
import { resetSidebarPreferences } from "./helpers/ui-settings";

test.use({ extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" } });

const SIDEBAR_PREFERENCES_KEY = "wrapt.sidebar-preferences.v1";

async function startWithDefaultSidebarPreferences(page: Page) {
  await resetSidebarPreferences();
  await page.addInitScript((key) => {
    const resetMarker = `${key}.test-reset`;
    if (window.sessionStorage.getItem(resetMarker)) return;
    window.localStorage.removeItem(key);
    window.sessionStorage.setItem(resetMarker, "1");
  }, SIDEBAR_PREFERENCES_KEY);
}

function settingsSection(page: Page, title: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

async function openSurfaceTab(page: Page) {
  await page.goto("/wrapt/settings");
  await page.getByRole("button", { name: "Navigation", exact: true }).click();
}

test("schaltet Seiten in Sidebar und Navigation um und behält die Auswahl nach Reload", async ({ page }) => {
  await startWithDefaultSidebarPreferences(page);
  await openSurfaceTab(page);

  const visibility = settingsSection(page, "Seiten-Sichtbarkeit");
  const codex = visibility.getByRole("button", { name: "Codex Codex", exact: true });

  await expect(codex.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Codex", exact: true })).toHaveCount(0);

  await codex.click();
  await expect(codex.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Codex", exact: true })).toBeVisible();

  await page.reload();
  await expect(visibility.getByRole("button", { name: "Codex Codex", exact: true }).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Codex", exact: true })).toBeVisible();

  await visibility.getByRole("button", { name: "Codex Codex", exact: true }).click();
  await page.reload();
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Codex", exact: true })).toHaveCount(0);
});

test("macht Claude Code als optionale CLI-Seite verfügbar", async ({ page }) => {
  await startWithDefaultSidebarPreferences(page);
  await openSurfaceTab(page);

  const visibility = settingsSection(page, "Seiten-Sichtbarkeit");
  const claude = visibility.getByRole("button", { name: "Claude Code Claude Code", exact: true });
  await expect(claude.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Claude Code", exact: true })).toHaveCount(0);

  await claude.click();
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Claude Code", exact: true })).toBeVisible();
  await page.locator(".workspace-sidebar").getByRole("link", { name: "Claude Code", exact: true }).click();
  await expect(page).toHaveURL(/\/wrapt\/claude$/);
  // Die CLI-Seite rendert die neue Terminalfläche mit vertikaler Sidebar.
  // Ohne konfiguriertes Projekt darf sie leer starten; die Sidebar und der
  // kind-spezifische Öffnen-Button sind der stabile Nutzervertrag.
  await expect(page.getByRole("complementary", { name: "Terminal-Sidebar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claude Code öffnen" }).first()).toBeVisible();
});
