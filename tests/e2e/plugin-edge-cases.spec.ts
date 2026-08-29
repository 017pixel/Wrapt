import { expect, test, type APIRequestContext } from "@playwright/test";

const origin = process.env.WRAPT_E2E_URL?.replace(/\/$/, "");
const workbench = origin ? `${origin}/wrapt` : undefined;
const identity = "user@example.com";
const extensionId = "wrapt.example.focus-timer";
const headers = { "tailscale-user-login": identity };

async function uninstallFocus(request: APIRequestContext) {
  const response = await request.get(`${origin}/api/v1/extensions`, { headers });
  if (!response.ok()) return;
  const registry = await response.json() as { revision: number; extensions: Array<{ id: string }> };
  if (!registry.extensions.some((extension) => extension.id === extensionId)) return;
  await request.post(`${origin}/api/v1/extensions/${extensionId}/operations`, {
    headers: { ...headers, "content-type": "application/json" },
    data: { operation: "uninstall", extensionId, expectedRevision: registry.revision, data: "delete" },
  });
}

test.use({ extraHTTPHeaders: headers, viewport: { width: 1000, height: 800 } });
test.use({ serviceWorkers: "block" });

test("verhindert doppeltes Installieren und zeigt keinen falschen Fehler", async ({ page, request }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await uninstallFocus(request);
  await page.goto(`${workbench}/plugins`);
  await page.getByRole("button", { name: "Installieren", exact: true }).click();
  const card = page.locator(".plugin-store-card", { hasText: "Fokus-Timer" });
  const install = card.getByRole("button", { name: "Installieren", exact: true });
  await expect(install).toBeVisible();
  await install.dblclick();
  await expect(card.getByRole("button", { name: "Deinstallieren", exact: true })).toBeVisible();
  await expect(page.getByText(/konnte nicht|fehlgeschlagen/i)).toHaveCount(0);
  const registry = await (await request.get(`${origin}/api/v1/extensions`, { headers })).json() as { extensions: Array<{ id: string; runtimeActive: boolean }> };
  expect(registry.extensions.filter((extension) => extension.id === extensionId)).toHaveLength(1);
  expect(registry.extensions.find((extension) => extension.id === extensionId)?.runtimeActive).toBe(true);
  await uninstallFocus(request);
});

test("zeigt bei Offline-Catalog keinen Installationserfolg", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.route("**/api/v1/extensions/catalog", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "offline" }),
  }));
  await page.goto(`${workbench}/plugins`);
  await page.getByRole("button", { name: "Installieren", exact: true }).click();
  await expect(page.getByText("Der Plugin-Store konnte nicht vollständig geladen werden.")).toBeVisible();
  await expect(page.locator(".plugin-store-card").getByRole("button", { name: "Installieren", exact: true })).toHaveCount(0);
  await expect(page.locator(".plugin-store-card").getByText("Aktiv", { exact: true })).toHaveCount(0);
});

test("übernimmt eine serverseitige Plugin-Änderung nach Tabwechsel", async ({ page, context, request }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await uninstallFocus(request);
  const secondTab = await context.newPage();
  try {
    await Promise.all([page.goto(`${workbench}/plugins`), secondTab.goto(`${workbench}/plugins`)]);
    await page.getByRole("button", { name: "Installieren", exact: true }).click();
    const card = page.locator(".plugin-store-card", { hasText: "Fokus-Timer" });
    await card.getByRole("button", { name: "Installieren", exact: true }).click();
    await expect(card.getByRole("button", { name: "Deinstallieren", exact: true })).toBeVisible();
    await secondTab.reload();
    await secondTab.getByRole("button", { name: "Installieren", exact: true }).click();
    await expect(secondTab.locator(".plugin-store-card", { hasText: "Fokus-Timer" }).getByRole("button", { name: "Deinstallieren", exact: true })).toBeVisible();
  } finally {
    await secondTab.close();
    await uninstallFocus(request);
  }
});
