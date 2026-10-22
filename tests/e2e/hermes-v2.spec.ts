import { expect, test as base } from "@playwright/test";
import { HermesV2BrowserGateway } from "./hermes-v2-gateway";
import { enableHermesV2, setHermesV2, waitForHermesV2 } from "./helpers/hermes-v2-settings";

const test = base.extend<{ gateway: HermesV2BrowserGateway }>({
  gateway: [async ({ context }, use) => {
    const gateway = new HermesV2BrowserGateway();
    gateway.seed("stored-id");
    await gateway.install(context);
    await setHermesV2(context, false);
    await context.route("**/hermes/**", async (route) => {
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Hermes Verwaltung</title><p>Klassische Testfläche</p>" });
    });
    try { await use(gateway); }
    finally { gateway.dispose(); }
  }, { auto: true }],
});

const e2eUser = process.env.WRAPT_E2E_USER ?? "user@example.com";
const settingsUrl = "/wrapt/settings#einstellungen:experimente";
const nativeRoot = '[data-hermes-ui="v2"]';
test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser }, viewport: { width: 1440, height: 900 } });

test("lässt V1 standardmäßig unverändert und erzeugt bei ausgeschaltetem Flag keinen V2-Traffic", async ({ page }) => {
  const v2Requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/v1/hermes/v2/")) v2Requests.push(request.url()); });
  page.on("websocket", (socket) => { if (socket.url().includes("/hermes/v2/")) v2Requests.push(socket.url()); });
  await page.goto("/wrapt/hermes-agent?session=classic-session");
  await expect(page.locator('[data-hermes-ui="official"]')).toBeVisible();
  await expect(page.locator('iframe[title="Hermes Agent"]')).toHaveAttribute("src", "/hermes/chat?resume=classic-session");
  await page.goto("/wrapt/hermes-v2");
  await expect(page.getByRole("switch", { name: /Hermes V2 aktivieren/ })).not.toBeChecked();
  await expect(page.locator(nativeRoot)).toHaveCount(0);
  await page.goto("/wrapt/hermes-v2/standalone");
  await expect(page.getByRole("switch", { name: /Hermes V2 aktivieren/ })).not.toBeChecked();
  expect(v2Requests).toEqual([]);
});

test("aktiviert V2 über Easter Eggs, erhält den Schalter nach Reload und kehrt zu V1 zurück", async ({ page }) => {
  await page.goto(settingsUrl);
  // Erst den initialen Serverabgleich abwarten, damit der Klick nicht von
  // einem verspäteten Fremdstand überschrieben wird.
  await page.waitForTimeout(750);
  const toggle = page.getByRole("switch", { name: /Hermes V2 aktivieren/ });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await waitForHermesV2(page, true);
  await page.reload();
  await expect(page.getByRole("switch", { name: /Hermes V2 aktivieren/ })).toBeChecked();
  await page.goto("/wrapt/hermes-agent");
  await expect(page.locator(nativeRoot)).toBeVisible();
  await expect(page.locator(`${nativeRoot} iframe`)).toHaveCount(0);
  await page.goto(settingsUrl);
  await page.getByRole("switch", { name: /Hermes V2 aktivieren/ }).click();
  await waitForHermesV2(page, false);
  await page.goto("/wrapt/hermes-agent");
  await expect(page.locator('[data-hermes-ui="official"]')).toBeVisible();
});

test("öffnet dieselbe native Oberfläche im Standalone und erhält klassische Verwaltungslinks", async ({ page }) => {
  await page.goto(settingsUrl);
  await page.waitForTimeout(750);
  await page.getByRole("switch", { name: /Hermes V2 aktivieren/ }).click();
  await waitForHermesV2(page, true);
  await page.goto("/wrapt/hermes-v2/standalone?session=stored-id");
  await expect(page.locator(nativeRoot)).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(page.locator(`${nativeRoot} iframe`)).toHaveCount(0);
  await page.goto("/wrapt/hermes-agent?ui=classic&session=stored-id");
  await expect(page.locator('iframe[title="Hermes Agent"]')).toHaveAttribute("src", "/hermes/chat?resume=stored-id");
  await page.goto("/wrapt/hermes-agent?path=%2Fcron%2Fjob-1");
  await expect(page.locator('iframe[title="Hermes Agent"]')).toHaveAttribute("src", "/hermes/cron/job-1");
});

test("synchronisiert den Flag zwischen normalem Tab und Standalone ohne Reload", async ({ page, context }) => {
  await page.goto(settingsUrl);
  const other = await context.newPage();
  await other.goto("/wrapt/hermes-v2/standalone");
  await expect(other.getByRole("switch", { name: /Hermes V2 aktivieren/ })).not.toBeChecked();
  await page.getByRole("switch", { name: /Hermes V2 aktivieren/ }).click();
  await expect(other.locator(nativeRoot)).toBeVisible();
  await page.getByRole("switch", { name: /Hermes V2 aktivieren/ }).click();
  await expect(other.locator(nativeRoot)).toHaveCount(0);
  await expect(other.getByRole("switch", { name: /Hermes V2 aktivieren/ })).not.toBeChecked();
  await other.close();
});

test("hält den Chat auf allen Abnahmebreiten zugänglich und den mobilen Drawer schließbar", async ({ page, context }) => {
  await enableHermesV2(context);
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/wrapt/hermes-v2/standalone?session=stored-id");
    await expect(page.locator(nativeRoot)).toHaveCount(1);
    const classic = page.getByRole("link", { name: "Klassisch", exact: true });
    await expect(classic).toBeInViewport();
    const input = page.getByRole("textbox", { name: "Nachricht an Hermes" });
    await expect(input).toBeInViewport();
    expect(await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width! <= 640) {
      const toggle = page.locator(".hermesv2-drawer-toggle");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(".hermesv2-sidebar")).not.toBeInViewport();
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(".hermesv2-sidebar")).toBeInViewport();
      const search = page.getByRole("searchbox", { name: "Sitzungen nach Titel, Kennung und Projekt suchen" });
      const searchBox = await search.boundingBox();
      expect(searchBox!.height).toBeGreaterThanOrEqual(44);
      expect(searchBox!.width).toBeGreaterThanOrEqual(44);
      expect(await search.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      await page.keyboard.press("Escape");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    }
  }
});

test("übernimmt die Session beim Öffnen des eigenen Fensters", async ({ page }) => {
  await page.goto("/wrapt/hermes-v2?session=stored-id");
  await page.getByRole("switch", { name: /Hermes V2 aktivieren/ }).click();
  const link = page.getByRole("link", { name: "Fenster", exact: true });
  await expect(link).toHaveAttribute("href", /\/wrapt\/hermes-v2\/standalone\?session=stored-id$/);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});
