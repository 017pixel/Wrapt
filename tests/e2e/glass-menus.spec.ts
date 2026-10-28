import { expect, test, type Locator } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("wrapt:overlay-transparency:v1", "100"));
});

async function expectGlass(surface: Locator, pseudo?: string) {
  await expect(surface).toBeVisible();
  await expect.poll(() => surface.evaluate((element, layer) => {
    const style = getComputedStyle(element, layer);
    return style.backdropFilter;
  }, pseudo)).toBe("blur(64px) saturate(1.08) contrast(0.7) brightness(0.5)");
  const background = await surface.evaluate((element, layer) => getComputedStyle(element, layer).backgroundColor, pseudo);
  expect(background).toContain(" / 0.4)");
}

test("Werkzeugaktionen und Projektwahl zeichnen Glas über einem eingebetteten Editor", async ({ page }) => {
  await page.route(/\/editor\//, (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><html lang='de'><body><p>Isolierter Editor</p></body></html>",
  }));
  await page.goto("/wrapt/code-editor");
  const trigger = page.getByRole("button", { name: "Werkzeugaktionen", exact: true });
  await trigger.click();
  await expectGlass(page.getByRole("menu", { name: "Werkzeugaktionen", exact: true }));
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.locator(".project-picker-trigger").click();
  const picker = page.locator(".project-picker-popover");
  await expectGlass(picker);
  await expect(picker.locator(".project-picker-search input")).toBeFocused();
  const background = await picker.locator(".project-picker-search").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toContain(" / 0.2)");
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
});

test("Notizenaktionen und Suchfilter bekommen dasselbe Material, auch innerhalb der Palette", async ({ page }) => {
  await page.goto("/wrapt/notizen");
  await page.locator(".notes-sidebar-new").click();
  await expect(page.getByLabel("Notiztitel")).toBeVisible();
  await page.locator(".notes-note-head").getByRole("button", { name: "Weitere Aktionen" }).click();
  await expectGlass(page.locator(".notes-head-popover"));
  await page.keyboard.press("Escape");
  await page.locator(".notes-search-row").click();
  const palette = page.locator(".notes-palette");
  await expectGlass(palette, "::before");
  await expect(palette).toHaveCSS("backdrop-filter", "none");
  await palette.getByText("Filter", { exact: true }).click();
  await palette.getByRole("button", { name: "Auf Seiten", exact: true }).click();
  await expectGlass(page.locator(".notes-filter-popover"));
});

test("Serverauswahl und Detailmenü bleiben unabhängige Glasflächen", async ({ page, baseURL }) => {
  await page.addInitScript(({ origin }) => {
    localStorage.setItem("wrapt.workspaces.v1", JSON.stringify({ version: 1, workspaces: [
      { id: "glass-main", name: "Testserver", url: origin, addedAt: "2026-10-14T00:00:00.000Z", lastUsedAt: null, customName: true },
      { id: "glass-second", name: "Demonstration", url: "https://demo.invalid", addedAt: "2026-10-14T00:00:00.000Z", lastUsedAt: null },
    ] }));
  }, { origin: new URL(baseURL!).origin });
  await page.goto("/wrapt");
  await page.locator(".sidebar-shell .workspace-switcher-trigger").click();
  await expectGlass(page.locator(".workspace-switcher-popover"));
  const row = page.locator(".workspace-entry").filter({ hasText: "Demonstration" });
  await row.locator(".workspace-entry-more").click();
  await expectGlass(page.locator(".workspace-entry-menu-panel"));
  await expect(page.locator(".workspace-switcher-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace-entry-menu-panel")).not.toBeVisible();
  await expect(page.locator(".workspace-switcher-popover")).toBeVisible();
});

test("Popup-Motive werden früh dekodiert und beim Öffnen wiederverwendet", async ({ page }) => {
  const images: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image" && request.url().includes("-surface-")) images.push(request.url());
  });
  const changelogResponse = page.waitForResponse((response) => response.url().includes("changelog-night-sky-surface"));
  await page.goto("/wrapt/projects");
  const response = await changelogResponse;
  expect((await response.body()).byteLength).toBeLessThan(15_000);
  await expect.poll(() => images.filter((url) => url.includes("hero-notizen-nutzung"))).toHaveLength(1);
  await page.getByRole("button", { name: "Changelog öffnen" }).press("Enter");
  const artwork = page.locator(".chc-artwork");
  await expect(artwork).toHaveCSS("opacity", "0.38");
  await expect(artwork).toHaveCSS("transition-duration", "0s");
  expect(images.filter((url) => url.includes("changelog-night-sky-surface"))).toHaveLength(1);
});

for (const width of [320, 390, 430]) {
  test(`Farbmenüs bleiben bei ${width}px sichtbar und auswählbar`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/wrapt/notizen");
    const beforeId = new URL(page.url()).searchParams.get("note");
    const previousEditor = await page.locator(".note-editor-content").elementHandle();
    await page.getByRole("navigation", { name: "Notiznavigation" }).getByRole("button", { name: "Neue Notiz erstellen" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("note")).not.toBe(beforeId);
    if (previousEditor) {
      await expect.poll(() => previousEditor.evaluate((element) => element.isConnected)).toBe(false);
      await previousEditor.dispose();
    }
    const editor = page.locator(".note-editor-content");
    await expect(editor).toBeVisible();
    await editor.fill("Ausgewählter Text mit lesbarer Formatierung.");
    await editor.press("ControlOrMeta+A");
    const toolbar = page.getByRole("toolbar", { name: "Formatierung" });
    await expectGlass(toolbar, "::before");
    await toolbar.getByRole("button", { name: "Hintergrundfarbe", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Hintergrundfarbe", exact: true });
    await expectGlass(menu);
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    await expect(menu.getByRole("menuitem", { name: "Gelb", exact: true })).toHaveCSS("height", "44px");
    await menu.getByRole("menuitem", { name: "Gelb", exact: true }).click();
    await expect(editor.locator("mark")).toHaveText("Ausgewählter Text mit lesbarer Formatierung.");
    await expect(editor).toBeFocused();
  });
}
