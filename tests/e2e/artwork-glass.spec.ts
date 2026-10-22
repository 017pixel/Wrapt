import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" },
  serviceWorkers: "block",
});

test("Transparenz wirkt live, bleibt gespeichert und respektiert höheren Kontrast", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wrapt/settings#einstellungen:design");
  const slider = page.getByRole("slider", { name: "Transparenz-Intensität" });
  await expect(slider).toHaveValue("100");
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveValue("300");
  await page.getByRole("button", { name: "Changelog öffnen" }).press("Enter");
  const card = page.locator(".chc");
  await expect(card).toBeVisible();
  await expect(card).toHaveCSS("backdrop-filter", /blur\(64px\)/);
  const glassBackground = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.keyboard.press("Escape");
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await page.getByRole("button", { name: "Changelog öffnen" }).press("Enter");
  await expect(card).toHaveCSS("backdrop-filter", /blur\(0px\)/);
  expect(await card.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(glassBackground);
  await page.keyboard.press("Escape");
  await slider.fill("73");
  await page.reload();
  await expect(slider).toHaveValue("73");
  await page.getByRole("button", { name: "Ember", exact: true }).click();
  await expect(slider).toHaveValue("73");
  await page.getByRole("button", { name: "Changelog öffnen" }).press("Enter");
  await page.emulateMedia({ contrast: "more", reducedMotion: "reduce" });
  await expect(card).toHaveCSS("backdrop-filter", "none");
  await expect(card).toHaveCSS("animation-name", "none");
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).backgroundColor.includes(" / "))).toBe(false);
  expect(errors).toEqual([]);
});

test("Nutzungspopup und native Auswahl behalten Glas und Tastaturbedienung", async ({ page }) => {
  // Die Transparenz liegt serverseitig; der vorherige Test hinterlässt dort 73.
  // Über die Oberfläche setzen, damit der Startwert unabhängig von der Testreihenfolge ist.
  await page.goto("/wrapt/settings#einstellungen:design");
  const transparency = page.getByRole("slider", { name: "Transparenz-Intensität" });
  await transparency.fill("100");
  await page.reload();
  await expect(transparency).toHaveValue("100");
  await page.goto("/wrapt/usage");
  await page.getByRole("button", { name: "Ansichtseinstellungen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ansichtseinstellungen" });
  await expect(dialog).toHaveCSS("backdrop-filter", /blur\(64px\)/);
  await page.getByRole("button", { name: "Ansicht schließen" }).click();
  const select = page.locator(".uf-select select").first();
  await select.focus();
  await select.selectOption("codex");
  await expect(select).toHaveValue("codex");
  await select.selectOption("all");
  await expect(select).toHaveValue("all");
  const hasCustomSelect = await page.evaluate(() => CSS.supports("appearance", "base-select"));
  if (hasCustomSelect) {
    await expect(select).toHaveCSS("appearance", "base-select");
    expect(await select.evaluate((element) => getComputedStyle(element, "::picker(select)").backdropFilter)).toContain("blur(64px)");
  }
});

test("Notizenmotiv bleibt dekorativ und Aktionen auf dem Handy erreichbar", async ({ page }) => {
  await page.route("**/api/v1/notes", (route) => route.fulfill({ json: { notes: [] } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wrapt/notizen");
  await expect(page.locator(".notes-empty-artwork")).toHaveClass(/is-loaded/);
  await expect(page.locator(".notes-empty-media")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Neue Seite", exact: true }).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Sekundärtext bleibt auch über einer hellen Preview lesbar", async ({ page }) => {
  await page.goto("/wrapt/settings#einstellungen:design");
  const slider = page.getByRole("slider", { name: "Transparenz-Intensität" });
  for (const theme of ["T3 Code", "T3 Chat", "Grove", "Ocean", "Ember", "Iris", "Dark Modern", "Monokai", "Carbon", "Signal"]) {
    await page.getByRole("button", { name: theme, exact: true }).click();
    for (const intensity of [0, 5, 10, 15, 25, 35, 55, 75, 100, 150, 200, 250, 300]) {
    await slider.fill(String(intensity));
    await page.getByRole("button", { name: "Changelog öffnen" }).press("Enter");
    const text = page.locator(".chc-current");
    await expect(text).toBeVisible();
    const contrast = await text.evaluate((element) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const sample = (color: string, underlyingWhite: boolean) => {
        context.clearRect(0, 0, 1, 1);
        if (underlyingWhite) {
          // Auch die Abdunklung des Hintergrundfilters gehört zum Material.
          context.filter = getComputedStyle(element.closest(".chc")!).backdropFilter.replace(/blur\([^)]*\)/, "blur(0px)");
          context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-accent-contrast");
          context.fillRect(0, 0, 1, 1);
        }
        context.filter = "none";
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const rgba = context.getImageData(0, 0, 1, 1).data;
        const linear = Array.from(rgba).slice(0, 3).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
      };
      const foreground = sample(getComputedStyle(element).color, false);
      const background = sample(getComputedStyle(element.closest(".chc")!).backgroundColor, true);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(contrast, `${theme}, Intensität ${intensity}`).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press("Escape");
    }
  }
});
