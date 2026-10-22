import { expect, test } from "@playwright/test";
import { apiIdentityHeaders, workbenchUrl } from "./helpers/environment";

test.use({ serviceWorkers: "block", extraHTTPHeaders: apiIdentityHeaders("user@example.com") });

test("bremst fehlenden Zugriff bis zu einem bewussten neuen Versuch", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/v1/**", async (route) => {
    attempts += 1;
    await route.fulfill({ status: 401, json: { error: { code: "WRAPT_IDENTITY_REQUIRED", message: "Tailscale erforderlich" } } });
  });
  await page.goto(workbenchUrl);
  await expect(page.getByRole("heading", { name: "Zugriff auf Wrapt erforderlich" })).toBeVisible();
  await page.waitForTimeout(6_500);
  expect(attempts).toBeLessThanOrEqual(2);
  const before = attempts;
  await page.getByRole("button", { name: "Zugriff erneut prüfen" }).click();
  await expect.poll(() => attempts).toBeGreaterThan(before);
});

test("zeigt mobile Einstellungen direkt und erhält alte Deep-Links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${workbenchUrl}/settings#einstellungen:werkzeuge`);
  const selection = page.getByRole("combobox", { name: "Bereich" });
  await expect(selection).toBeVisible();
  await expect(selection).toHaveValue("werkzeuge");
  const content = page.getByRole("heading", { name: "Limitüberwachung", exact: true });
  await expect(content).toBeVisible();
  expect((await content.boundingBox())!.y).toBeLessThan(400);
  await selection.selectOption("experimente");
  await expect(page.getByRole("heading", { name: "Hermes V2", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Hermes V2 aktivieren" })).toBeVisible();
});

test("erhält den Notizeditor bei einem fehlgeschlagenen Hintergrundabruf", async ({ page }) => {
  const response = await page.request.post(new URL("/api/v1/notes", workbenchUrl).href, { headers: apiIdentityHeaders("user@example.com"), data: { title: "Abruf prüfen", parentId: null } });
  expect(response.ok()).toBe(true);
  const { note } = await response.json() as { note: { id: string } };
  try {
    await page.goto(`${workbenchUrl}/notizen?note=${note.id}`);
    const editor = page.locator(".note-editor-content").first();
    await expect(editor).toBeVisible();
    await editor.evaluate((element) => { element.setAttribute("data-survives-refresh", "yes"); });
    await editor.fill("Dieser Entwurf bleibt im Editor.");
    await page.route(`**/api/v1/notes/${note.id}`, (route) => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Vorübergehend nicht erreichbar", retryable: true } } }));
    await expect(page.getByText("Aktualisierung fehlgeschlagen", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(editor).toHaveAttribute("data-survives-refresh", "yes");
    await expect(editor).toContainText("Dieser Entwurf bleibt im Editor.");
    await page.unroute(`**/api/v1/notes/${note.id}`);
  } finally {
    await page.request.delete(new URL(`/api/v1/notes/${note.id}`, workbenchUrl).href, { headers: apiIdentityHeaders("user@example.com") });
  }
});
