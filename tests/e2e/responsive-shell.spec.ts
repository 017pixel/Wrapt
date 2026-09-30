import { expect, test, type Page } from "@playwright/test";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

const routes = [
  "", "projects", "settings", "usage", "orbit",
  "terminal", "previews", "code-editor", "t3-code", "codex", "opencode", "claude", "notizen",
];

function usesTabletLandscapeSidebar(page: Page): boolean {
  const viewport = page.viewportSize();
  return Boolean(viewport && viewport.width >= 1_024 && viewport.width > viewport.height);
}

async function mockPreviewSlots(page: Page) {
  const slots = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    internalPort: 3_901 + index,
    publicPort: 8_451 + index,
    targetPort: null as number | null,
    publicUrl: `https://preview-${index + 1}.example.test/`,
    updatedAt: null as string | null,
  }));
  await page.route("**/api/v1/previews/slots", async (route) => {
    let assignedSlotId: number | null = null;
    if (route.request().method() === "PUT") {
      const input = route.request().postDataJSON() as { slotId?: number | null; targetPort: number | null };
      assignedSlotId = input.slotId ?? slots.find((slot) => slot.targetPort === null)?.id ?? null;
      const slot = slots.find((candidate) => candidate.id === assignedSlotId);
      if (slot) {
        slot.targetPort = input.targetPort;
        slot.updatedAt = new Date().toISOString();
      }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ slots, assignedSlotId }) });
  });
}

test("uses mobile navigation or the iPad landscape sidebar for the viewport", async ({ page }) => {
  await page.goto("/wrapt/");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-shell-mode", /compact|tablet/);
  if (usesTabletLandscapeSidebar(page)) {
    await expect(shell).toHaveAttribute("data-shell-mode", "tablet");
    const sidebar = page.locator(".sidebar-shell");
    await expect(sidebar).toHaveCount(1);
    await expect(page.locator(".status-bar")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Navigation öffnen" })).toHaveCount(0);
    const sidebarWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
    expect(sidebarWidth).toBeGreaterThanOrEqual(208);
    expect(sidebarWidth).toBeLessThanOrEqual(Math.round((page.viewportSize()?.width ?? 0) * 0.22) + 1);
    return;
  }
  await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
  await expect(page.locator(".status-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Navigation öffnen" })).toBeVisible();
  const size = await page.getByRole("button", { name: "Navigation öffnen" }).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
});

test.describe("Orbit auf dem iPad im Querformat", () => {
  test.use({ viewport: { width: 1_024, height: 768 }, hasTouch: true });

  test("behält die Navigation erreichbar, wenn die Orbit-Leiste sichtbar ist", async ({ page }) => {
    await page.goto("/wrapt/orbit");
    await expect(page.locator(".app-shell")).toHaveAttribute("data-shell-mode", "tablet");
    await expect(page.locator(".app-shell")).toHaveAttribute("data-orientation", "landscape");
    const sidebar = page.locator(".sidebar-shell");
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole("button", { name: "Navigation öffnen" })).toHaveCount(0);
    await sidebar.getByRole("link", { name: /Projekte/ }).click();
    await expect(page).toHaveURL(/\/wrapt\/projects$/);
  });
});

test("navigation page manages focus, history and scroll lock", async ({ page }) => {
  test.skip(usesTabletLandscapeSidebar(page), "Das iPad im Querformat nutzt die Seitenleiste.");
  await page.goto("/wrapt/");
  const trigger = page.getByRole("button", { name: "Navigation öffnen" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".mobile-nav-trigger")).toHaveCount(0);
  await expect(page.locator(".content-column")).toHaveAttribute("inert", "");
  await expect(dialog.getByRole("button", { name: "Navigation schließen" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("keeps route floating controls behind the navigation page", async ({ page }) => {
  test.skip(usesTabletLandscapeSidebar(page), "Das iPad im Querformat nutzt die Seitenleiste.");
  const floatingRoutes = ["", "orbit", "terminal"];
  const floatingSelector = [
    ".orbit-main-island",
    ".terminal-island",
    ".panel-island",
  ].join(",");

  for (const route of floatingRoutes) {
    await page.goto(`/wrapt/${route}`);
    await page.getByRole("button", { name: "Navigation öffnen" }).click();
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".mobile-nav-trigger")).toHaveCount(0);

    const layers = await page.locator(floatingSelector).evaluateAll((elements) => elements
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => Number.parseInt(getComputedStyle(element).zIndex, 10) || 0));
    const navigationLayer = Number.parseInt(await dialog.evaluate((element) => getComputedStyle(element).zIndex), 10);
    expect(navigationLayer).toBe(250);
    expect(layers.every((layer) => layer < navigationLayer), route).toBe(true);

    await dialog.getByRole("button", { name: "Navigation schließen" }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test("keeps all main routes inside the viewport", async ({ page }) => {
  test.setTimeout(90_000);
  await mockPreviewSlots(page);
  for (const route of routes) {
    await page.goto(`/wrapt/${route}`);
    await expect(page.locator(".app-shell")).toBeVisible();
    // Die Shell erscheint vor der Lazy-Route; warte auf deren geladenen Inhalt.
    await expect(page.locator('[aria-label="Ansicht wird geladen"]')).toHaveCount(0);
    const overflow = await page.locator(".app-shell").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(overflow.scrollWidth, route).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(overflow.scrollHeight, route).toBeLessThanOrEqual(overflow.clientHeight + 1);
  }
});

test("uses a reversible touch dialog for destructive settings", async ({ page }) => {
  await page.goto("/wrapt/settings");
  // Der lokale Layout-Reset liegt im gleichnamigen Tab.
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Layout zurücksetzen" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Layout zurücksetzen?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Abbrechen" })).toBeFocused();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("moves focus into content after a navigation choice", async ({ page }) => {
  test.skip(usesTabletLandscapeSidebar(page), "Das iPad im Querformat nutzt die Seitenleiste.");
  await page.goto("/wrapt/");
  await page.getByRole("button", { name: "Navigation öffnen" }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Projekte" }).click();
  await expect(page).toHaveURL(/\/wrapt\/projects$/);
  await expect(page.locator("#main-content")).toBeFocused();
});

test("bleibt bei 200 Prozent Textgröße zugänglich und innerhalb des Viewports", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 860, "Der kompakte Status gilt für kleine Viewports.");
  await page.goto("/wrapt/");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect(page.getByRole("button", { name: "Navigation öffnen" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Kompakter Systemstatus" })).toBeVisible();
  await expect(page.locator("#main-content")).toHaveAttribute("tabindex", "-1");
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});
