import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" },
  serviceWorkers: "block",
});

test("wählt Hintergründe mit Buttons, Tastatur und Wischen und behält die Auswahl", async ({ page }) => {
  await page.goto("/wrapt/settings#einstellungen:easter-eggs");
  const track = page.locator(".dashboard-artwork-carousel");
  const previous = page.getByRole("button", { name: "Vorheriger Hintergrund" });
  const next = page.getByRole("button", { name: "Nächster Hintergrund" });
  await page.getByRole("radio", { name: "Nachthimmel", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(page.getByRole("radio", { name: "Arbeitsbereich", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Arbeitsbereich", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Architektur", exact: true })).toBeChecked();
  await track.evaluate((element) => { element.scrollLeft += element.clientWidth; });
  await expect(page.getByRole("radio", { name: "Changelog", exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Changelog", exact: true })).toBeChecked();
  await expect.poll(() => track.evaluate((element) => Math.round(element.scrollLeft / element.clientWidth))).toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => track.evaluate((element) => Math.round(element.scrollLeft / element.clientWidth))).toBe(3);
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Native Radio-Tastaturbedienung erreicht auch den letzten Eintrag.
  await page.getByRole("radio", { name: "Changelog", exact: true }).focus();
  for (let index = 0; index < await track.getByRole("radio").count() - 4; index++) await page.keyboard.press("ArrowRight");
  await expect(next).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Zugriff & Sicherheit", exact: true })).toBeChecked();
});

test("hält die Füße in der Statusleiste bei jeder Größe oberhalb der Fensterkante", async ({ page }) => {
  await page.goto("/wrapt/settings#einstellungen:easter-eggs");
  const toggle = page.getByRole("switch", { name: /Maskottchen anzeigen/ });
  if (await toggle.getAttribute("aria-checked") === "false") await toggle.click();
  const slider = page.getByRole("slider", { name: "Größe", exact: true });
  for (const value of ["50", "100", "200"]) {
    await slider.fill(value);
    await slider.blur();
    await expect(page.locator(".status-mascot")).toHaveAttribute("data-scale", String(Number(value) / 100));
    const sprite = page.locator(".status-mascot .capy-sprite");
    // Ruhige Pose verhindert zeitabhängige Messwerte während des Laufens.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const feet = await sprite.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      // Alle 64px-Sprites enden spätestens in Pixelzeile 55.
      return { bottom: bounds.top + bounds.height * 55 / 64, viewport: innerHeight };
    });
    expect(feet.bottom).toBeLessThanOrEqual(feet.viewport - 1);
    await expect(page.getByRole("button", { name: "Capybara testen" })).toHaveAttribute("data-scale", String(Number(value) / 100));
  }
  await toggle.click();
  await slider.fill("100");
  await slider.blur();
});

test("nutzt dieselbe Figur in Vorschau und Statusleiste und bereinigt Rechtsklick", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wrapt/settings#einstellungen:easter-eggs");
  await page.getByRole("button", { name: "Party", exact: true }).click();
  const preview = page.getByRole("button", { name: "Capybara testen" });
  await expect(preview.locator(".capy-confetti-piece")).toHaveCount(3);
  const toggle = page.getByRole("switch", { name: /Maskottchen anzeigen/ });
  if (await toggle.getAttribute("aria-checked") === "false") await toggle.click();
  const actor = page.getByRole("button", { name: "Capybara begrüßen" });
  const geometry = async (selector: string) => page.locator(selector).evaluate((element) => {
    const image = element.querySelector(".capy-sprite")!;
    const css = getComputedStyle(image);
    const bounds = element.getBoundingClientRect();
    return { width: Math.round(bounds.width * 100) / 100, height: Math.round(bounds.height * 100) / 100, imageWidth: image.getAttribute("width"), rest: css.getPropertyValue("--capy-rest-y") };
  });
  expect(await geometry(".mascot-preview .status-mascot-button")).toEqual(await geometry(".status-mascot .status-mascot-button"));
  await expect(actor).toBeVisible();
  await expect(page.locator(".mascot-setting-message")).toHaveCount(0);
  await page.getByRole("button", { name: "Rechtsklick", exact: true }).click();
  await expect(page.getByText("Limits immer anzeigen", { exact: true })).toHaveCount(0);
  await expect(page.locator(".context-menu-surface-list")).not.toContainText("host.context-menu");
  expect(errors).toEqual([]);
});
