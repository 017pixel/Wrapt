import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

test("keeps the information-dense desktop shell", async ({ page }) => {
  await page.goto("/wrapt/");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-shell-mode", "desktop");
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".status-bar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Navigation öffnen" })).toHaveCount(0);

  for (const route of ["", "workbench", "tech-tldrs", "browser", "projects", "usage", "settings"]) {
    await page.goto(`/wrapt/${route}`);
    const bounds = await page.locator(".app-shell").evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(bounds.scroll, route).toBeLessThanOrEqual(bounds.client + 1);
  }
});

test("moves standalone T3 Code actions into the topbar", async ({ page }) => {
  await page.goto("/wrapt/t3-code");
  const actions = page.locator("#topbar-tool-actions");
  await expect(actions).toBeVisible();
  await expect(page.getByRole("button", { name: "Projekt auswählen" })).toHaveCount(0);
  await actions.getByRole("button", { name: "Werkzeugaktionen" }).click();
  const menu = actions.getByRole("menu", { name: "Werkzeugaktionen" });
  await expect(menu.getByRole("menuitem", { name: "Neu laden" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "In neuem Tab öffnen" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Vollbild" })).toBeVisible();
  await expect(page.locator(".standalone-tool-content .panel-island")).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Vollbild" }).click();
  await expect(page.locator(".tool-surface-maximized")).toBeVisible();
  // Im Vollbild steht die Wiederherstellen-Aktion direkt in den Topbar-Aktionen.
  await expect(page.locator("#topbar-tool-actions").getByRole("button", { name: "Wiederherstellen" })).toBeVisible();
});

test("öffnet Schnellaktionen auf freien Bereichen der Shell", async ({ page }) => {
  await page.goto("/wrapt/files");
  const menu = page.locator('.global-context-menu[data-surface="host.context-menu.empty"]');
  const topbar = page.locator(".topbar");
  const topbarBox = await topbar.boundingBox();
  await topbar.click({ button: "right", position: { x: Math.round((topbarBox?.width ?? 800) / 2), y: 24 } });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  const statusBar = page.locator(".status-bar");
  await statusBar.click({ button: "right", position: { x: 4, y: 20 } });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("öffnet Schnellaktionen im freien Bereich der linken Sidebar", async ({ page }) => {
  await page.goto("/wrapt/files");
  await page.getByRole("button", { name: "Workspace einklappen" }).click();
  await page.getByRole("button", { name: "Werkzeuge einklappen" }).click();

  const menu = page.locator('.global-context-menu[data-surface="host.context-menu.empty"]');
  await page.locator(".sidebar-scroll").click({ button: "right", position: { x: 120, y: 300 } });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("hält Plugin-Topbar und Werkzeugaktionen als rechte Gruppe zusammen", async ({ page }) => {
  await page.goto("/wrapt/files");
  const topbar = page.locator(".topbar");
  const rightActions = topbar.locator(".topbar-right-actions");
  const topbarBox = await topbar.boundingBox();
  const rightActionsBox = await rightActions.boundingBox();
  expect(rightActionsBox).not.toBeNull();
  expect((rightActionsBox?.x ?? 0) + (rightActionsBox?.width ?? 0)).toBeCloseTo((topbarBox?.x ?? 0) + (topbarBox?.width ?? 0) - 24, 0);

  const plugin = rightActions.locator(".plugin-topbar-stack");
  if (await plugin.count()) {
    const pluginBox = await plugin.boundingBox();
    const toolActions = rightActions.locator(".tool-actions-menu.is-topbar");
    const toolActionsBox = await toolActions.boundingBox();
    expect(pluginBox).not.toBeNull();
    expect(toolActionsBox).not.toBeNull();
    expect(pluginBox!.x).toBeGreaterThan((topbarBox?.x ?? 0) + (topbarBox?.width ?? 0) / 2);
    expect(pluginBox!.x + pluginBox!.width).toBeLessThanOrEqual(toolActionsBox!.x + 1);
  }
});

test("keeps one standalone tool menu after switching between tool routes", async ({ page }) => {
  await page.goto("/wrapt/t3-code");
  const actions = page.locator("#topbar-tool-actions");
  await expect(actions.getByRole("button", { name: "Werkzeugaktionen" })).toHaveCount(1);

  await page.getByRole("link", { name: "Code-Server" }).click();
  await expect(page).toHaveURL(/\/wrapt\/code-editor$/);
  await expect(page.locator('iframe[title="Editor"]')).toBeVisible();
  await expect(page.locator("#topbar-tool-actions").getByRole("button", { name: "Werkzeugaktionen" })).toHaveCount(1);

  await page.getByRole("link", { name: "T3 Code" }).click();
  await expect(page).toHaveURL(/\/wrapt\/t3-code$/);
  await expect(page.locator("#topbar-tool-actions").getByRole("button", { name: "Werkzeugaktionen" })).toHaveCount(1);
});
