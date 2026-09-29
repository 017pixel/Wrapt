import { expect, test } from "@playwright/test";

test("zeigt die Serverauswahl erst nach dem Hinzufügen eines zweiten Hosts", async ({ page }) => {
  await page.route("https://zweit.example.ts.net/api/v1/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ status: "ok", version: "1.23.0", appName: "Wrapt", instanceName: "Zweitserver" }),
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
