import { expect, test } from "@playwright/test";

// Der Verbindungs-Test läuft gegen den Probe-Endpunkt des eigenen Servers.
// Ohne Service Worker kontrollieren Mock-Routen jede Anfrage deterministisch;
// ein installierter Worker könnte Mocks umgehen.
test.use({ serviceWorkers: "block" });

test("zeigt die Serverauswahl erst nach dem Hinzufügen eines zweiten Hosts", async ({ page }) => {
  // Die Registry dieses Einzelhost-Tests bleibt von anderen Browserläufen getrennt.
  let registry = { entries: [], changedAt: {}, deletedAt: {} };
  let revision = 0;
  await page.route("**/api/v1/workspaces/registry", async (route) => {
    if (route.request().method() === "PUT") {
      registry = route.request().postDataJSON().document;
      revision += 1;
    }
    await route.fulfill({ json: { document: registry, revision, updatedAt: new Date().toISOString() } });
  });
  await page.route("**/api/v1/workspaces/probe", async (route) => {
    await route.fulfill({
      json: { status: "live", reachable: true, version: "1.23.0", instanceName: "Zweitserver", appName: "Wrapt", bootId: "boot-zweit" },
    });
  });
  await page.goto("/wrapt/");
  await expect(page.locator(".workspace-switcher-trigger")).toHaveCount(0);

  await page.goto("/wrapt/settings");
  await page.getByRole("button", { name: "Workspaces", exact: true }).click();
  await page.locator("#settings-workspaces").getByRole("button", { name: "Server hinzufügen" }).click();
  const editor = page.getByRole("dialog", { name: "Server hinzufügen" });
  await editor.getByRole("textbox", { name: "URL" }).fill("https://zweit.example.ts.net");
  await editor.getByRole("textbox", { name: "Name" }).fill("Zweitserver");
  await editor.getByRole("button", { name: "Verbindung prüfen" }).click();
  await expect(editor.getByRole("button", { name: "Server hinzufügen" })).toBeEnabled();
  await editor.getByRole("button", { name: "Server hinzufügen" }).click();
  await expect(page.locator(".sidebar-shell .workspace-switcher-trigger")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Navigation öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" }).getByRole("button", { name: /Server wechseln/ })).toBeVisible();
});
