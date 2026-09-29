import { expect, test, type Page } from "@playwright/test";

test.use({ extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" } });

const SIDEBAR_PREFERENCES_KEY = "wrapt.sidebar-preferences.v1";

async function startWithDefaultSidebarPreferences(page: Page) {
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

test("zeigt Orbit erst nach Aktivierung in den Einstellungen", async ({ page }) => {
  await startWithDefaultSidebarPreferences(page);
  await openSurfaceTab(page);

  const visibility = settingsSection(page, "Seiten-Sichtbarkeit");
  const orbit = visibility.getByRole("button", { name: "Orbit Orbit", exact: true });
  const sidebarOrbit = page.locator(".workspace-sidebar").getByRole("link", { name: "Orbit", exact: true });
  await expect(orbit.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(sidebarOrbit).toHaveCount(0);

  await orbit.click();
  await expect(orbit.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(sidebarOrbit).toBeVisible();
  await sidebarOrbit.click();
  await expect(page).toHaveURL(/\/wrapt\/orbit$/);

  await page.reload();
  await expect(sidebarOrbit).toBeVisible();
  await openSurfaceTab(page);
  await visibility.getByRole("button", { name: "Orbit Orbit", exact: true }).click();
  await expect(sidebarOrbit).toHaveCount(0);
});

test("wendet Orbit-Sidebar-Schalter sofort und nach Reload an", async ({ page }) => {
  await startWithDefaultSidebarPreferences(page);
  await openSurfaceTab(page);

  const orbitSettings = settingsSection(page, "Orbit-Sidebar");
  await orbitSettings.getByRole("button", { name: "OpenCode OpenCode", exact: true }).click();

  await page.goto("/wrapt/orbit");
  const orbitTools = page.locator(".sidebar-section")
    .filter({ has: page.locator(".sidebar-section-header", { hasText: "Werkzeuge" }) })
    .filter({ has: page.locator(".orbit-palette-item") })
    .first();
  await expect(orbitTools.locator(".orbit-palette-item").filter({ hasText: "OpenCode" })).toHaveCount(0);

  await page.reload();
  const reloadedOrbitTools = page.locator(".sidebar-section")
    .filter({ has: page.locator(".sidebar-section-header", { hasText: "Werkzeuge" }) })
    .filter({ has: page.locator(".orbit-palette-item") })
    .first();
  await expect(reloadedOrbitTools.locator(".orbit-palette-item").filter({ hasText: "OpenCode" })).toHaveCount(0);
});

test("hält Orbit-Projekte, Orbit-Werkzeuge und allgemeine Werkzeuge getrennt", async ({ page }) => {
  await startWithDefaultSidebarPreferences(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/wrapt/orbit");

  await page.getByRole("button", { name: "Orbit-Projekte einklappen" }).click();
  await page.getByRole("button", { name: "Orbit-Werkzeuge einklappen" }).click();
  await expect(page.getByRole("button", { name: "Orbit-Projekte ausklappen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Orbit-Werkzeuge ausklappen" })).toBeVisible();

  await page.goto("/wrapt/");
  await page.getByRole("button", { name: "Werkzeuge einklappen" }).click();
  const persisted = await page.evaluate((key) => {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return value.state?.collapsedSections as Record<string, boolean>;
  }, SIDEBAR_PREFERENCES_KEY);
  expect(persisted["orbit-projects"]).toBe(true);
  expect(persisted["orbit-tools"]).toBe(true);
  expect(persisted.tools).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wrapt/orbit");
  await page.getByRole("button", { name: "Navigation öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/wrapt\/?$/);
  const afterMobileNavigation = await page.evaluate((key) => {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return value.state?.collapsedSections as Record<string, boolean>;
  }, SIDEBAR_PREFERENCES_KEY);
  expect(afterMobileNavigation["orbit-projects"]).toBe(true);
  expect(afterMobileNavigation["orbit-tools"]).toBe(true);
  expect(afterMobileNavigation.tools).toBe(true);

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/wrapt/orbit");
  await expect(page.getByRole("button", { name: "Orbit-Projekte ausklappen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Orbit-Werkzeuge ausklappen" })).toBeVisible();
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
