import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" },
  serviceWorkers: "block",
});

test("ordnet die Einstellungsbereiche und den Neustart auf Allgemein", async ({ page }) => {
  await page.goto("/wrapt/settings");

  await expect(page.getByRole("searchbox", { name: "Einstellungen durchsuchen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Neustart", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Frontend/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Backend/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Beides/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nach Updates suchen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update installieren" })).toBeVisible();
  await expect(page.getByText("DARK ONLY", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Alle Themes bleiben dunkel.", { exact: false })).toHaveCount(0);
});

test("findet Design über Alias und Tippfehler und springt zum Bereich", async ({ page }) => {
  await page.goto("/wrapt/settings");
  const search = page.getByRole("searchbox", { name: "Einstellungen durchsuchen" });

  await search.fill("Aussehen");
  const aliasResult = page.locator("#settings-search-results").getByRole("button", { name: /Design/ }).first();
  await expect(aliasResult).toBeVisible();
  await aliasResult.click();
  await expect(page.getByRole("button", { name: "Design", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Vorgefertigte Themes", exact: true })).toBeVisible();

  await search.fill("desgin");
  await expect(page.locator("#settings-search-results").getByRole("button", { name: /Design/ }).first()).toBeVisible();
});

test("öffnet den verschobenen Start-App-Bereich", async ({ page }) => {
  await page.goto("/wrapt/settings");
  await page.getByRole("button", { name: "Start-App", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start-App", exact: true })).toBeVisible();
  await expect(page.getByText("Welche Seite beim Öffnen von Wrapt geladen wird", { exact: true })).toBeVisible();
});

test("erreicht jeden Einstellungs-Tab und rendert seinen Fachbereich", async ({ page }) => {
  await page.goto("/wrapt/settings");
  const tabs = [
    ["Allgemein", "settings-general-restart"],
    ["Design", "settings-design"],
    ["Navigation", "settings-navigation"],
    ["Rechtsklick", "settings-context-menu"],
    ["Benachrichtigungen", "settings-notifications"],
    ["System", "settings-system"],
    ["Erweiterungen", "settings-extensions"],
    ["Werkzeuge", "settings-usage"],
    ["Workspace", "settings-workspace"],
    ["Easter Eggs", "settings-easter-eggs"],
    ["Start-App", "settings-start-app"],
  ] as const;

  for (const [label, anchor] of tabs) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(`#${anchor}`)).toBeVisible();
  }
});

test("testet die neuen Capybara-Aktionen", async ({ page }) => {
  await page.goto("/wrapt/settings");
  await page.getByRole("button", { name: "Easter Eggs", exact: true }).click();

  const preview = page.getByRole("button", { name: "Capybara testen" });
  await expect(preview).toBeVisible();

  await page.getByRole("button", { name: "Gähnen", exact: true }).click();
  await expect(preview).toHaveAttribute("data-action", "wake");
  await expect(preview).toHaveAttribute("data-frame", /yawn/);

  await page.getByRole("button", { name: "Party", exact: true }).click();
  await expect(preview).toHaveAttribute("data-frame", "party");
  await expect(preview.locator(".capy-confetti-piece")).toHaveCount(3);

  // Nickerchen schläfert sofort ein und zeigt die drei Zzz-Frames.
  await page.getByRole("button", { name: "Nickerchen", exact: true }).click();
  await expect(preview).toHaveAttribute("data-sleeping", "true");
  await expect(preview).toHaveAttribute("data-frame", "sleep");
  await expect(preview.locator(".capy-zzz img")).toHaveCount(3);

  // Klick weckt es mit einem Gähnen, der nächste Klick jubelt.
  await preview.click();
  await expect(preview).toHaveAttribute("data-sleeping", "false");
  await expect(preview).toHaveAttribute("data-action", "wake");
  await preview.click();
  await expect(preview).toHaveAttribute("data-action", "celebrate");
});

test("schläft nach kurzer Ruhe von selbst ein", async ({ page }) => {
  await page.goto("/wrapt/settings");
  await page.getByRole("button", { name: "Easter Eggs", exact: true }).click();

  const preview = page.getByRole("button", { name: "Capybara testen" });
  await expect(preview).toHaveAttribute("data-sleeping", "false");

  // Die Vorschau nutzt eine kurze Frist, damit sich das Nickerchen zeigen lässt.
  await expect(preview).toHaveAttribute("data-sleeping", "true", { timeout: 25_000 });
  await expect(preview).toHaveAttribute("data-frame", "sleep");

  await preview.click();
  await expect(preview).toHaveAttribute("data-sleeping", "false");
});

test("testet Capybara-Vorschau und Schalter", async ({ page }) => {
  await page.goto("/wrapt/settings");
  await page.getByRole("button", { name: "Easter Eggs", exact: true }).click();

  const preview = page.getByRole("button", { name: "Capybara testen" });
  await expect(preview).toBeVisible();
  const sprite = preview.locator("img");
  await expect(sprite).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect.poll(() => sprite.evaluate((image) => ({ width: image.naturalWidth, height: image.naturalHeight })))
    .toEqual({ width: 64, height: 64 });

  await preview.click();
  await expect(preview).toHaveAttribute("data-action", "celebrate");
  await expect(preview).toHaveAttribute("data-frame", "happyA");

  // Größenregler skaliert die Vorschau sofort.
  const slider = page.getByRole("slider", { name: "Größe" });
  await expect(slider).toHaveValue("100");
  await slider.fill("150");
  await expect(slider).toHaveValue("150");
  // Gespeichert wird erst beim Loslassen des Reglers.
  await slider.blur();
  await expect(preview).toHaveAttribute("data-scale", "1.5");
  await expect.poll(() => sprite.evaluate((image) => image.getAttribute("width")))
    .toBe("158");

  const toggle = page.getByRole("switch", { name: /Maskottchen anzeigen/ });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("In der Statusleiste pausiert", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capybara begrüßen" })).toHaveCount(0);
  try {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(
      "Das Capybara ist unterwegs.",
      { exact: true },
    )).toBeVisible();
    // Die Statusleiste übernimmt die gespeicherte Größe (150 % von 88 px).
    const mascot = page.locator(".status-mascot");
    await expect(mascot).toHaveAttribute("data-scale", "1.5");
    await expect(page.getByRole("button", { name: "Capybara begrüßen" }).locator("img"))
      .toHaveAttribute("width", "132");
  } finally {
    await slider.fill("100");
    await slider.blur();
    if ((await toggle.getAttribute("aria-checked")) === "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect(page.getByRole("button", { name: "Capybara begrüßen" })).toHaveCount(0);
    }
  }
});
