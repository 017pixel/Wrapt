import { expect, test, type Locator, type Page } from "@playwright/test";

const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

async function openMaker(page: Page, mode: "Visuell erstellen" | "Mit Code erstellen") {
  await page.goto(`${workbench}/plugins`);
  await page.getByRole("button", { name: "Neues Plugin erstellen" }).click();
  await page.getByRole("dialog", { name: "Neues Plugin erstellen" }).getByRole("button", { name: new RegExp(mode) }).click();
  await expect(page.getByRole("heading", { name: "Plugin erstellen" })).toBeVisible();
}

async function fillIdentity(page: Page, name: string, slug: string) {
  const basics = page.locator("section.plugin-maker-panel", {
    has: page.getByRole("heading", { name: "Plugin definieren" }),
  });
  await basics.getByLabel("Name").fill(name);
  await basics.getByLabel("Slug").fill(slug);
  await basics.getByLabel("Beschreibung").fill(`${name} als isolierter E2E-Draft.`);
}

async function activateAndOpen(page: Page, name: string, slug: string) {
  await page.getByRole("button", { name: "Aktivieren", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Plugin lokal aktiviert.");
  const sidebar = page.locator("aside").getByRole("link", { name });
  await expect(sidebar).toBeVisible({ timeout: 15_000 });
  await sidebar.click();
  await expect(page).toHaveURL(new RegExp(`/plugins/tool/${slug}$`));
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function expectActionsInOneLine(row: Locator) {
  const boxes = await row.locator(".plugins-installed-actions > *").evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()).map(({ y, height }) => y + height / 2));
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(4);
  const rowBox = await row.boundingBox();
  expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(68);
}

test("erstellt leichte, mittlere und komplexe Plugins im visuellen Editor", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  const variants = [
    { name: "Visuell Leicht", slug: "visual-light", functions: 0, complex: false },
    { name: "Visuell Mittel", slug: "visual-medium", functions: 1, complex: false },
    { name: "Visuell Komplex", slug: "visual-complex", functions: 2, complex: true },
  ];

  for (const variant of variants) {
    await openMaker(page, "Visuell erstellen");
    await fillIdentity(page, variant.name, variant.slug);
    const functions = page.locator("section.plugin-maker-panel", {
      has: page.getByRole("heading", { name: "Funktionen" }),
    });
    for (let index = 0; index < variant.functions; index += 1) {
      await functions.getByRole("button", { name: "Hinzufügen" }).click();
      await functions.getByLabel(`Name Funktion ${index + 1}`).fill(`Aktion ${index + 1}`);
    }
    if (variant.complex) {
      await page.getByRole("checkbox", { name: /Topbar/i }).check();
      await page.getByRole("checkbox", { name: /Orbit Node, Inspector/i }).check();
      await page.getByRole("button", { name: "Fähigkeit hinzufügen" }).click();
      await page.getByRole("textbox", { name: "Fähigkeit 1", exact: true }).fill("Status aktualisieren");
    }
    await activateAndOpen(page, variant.name, variant.slug);
  }

  await page.goto(`${workbench}/plugins`);
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Eigene Plugins" }).click();
  const row = page.locator(".plugin-draft-row", { hasText: "Visuell Leicht" });
  await expect(row.getByRole("link", { name: "Bearbeiten" })).toBeVisible();
  await expect(row.getByRole("button", { name: /deaktivieren/i })).toBeVisible();
  await expect(row.getByRole("link", { name: "Seite öffnen" })).toBeVisible();
  await expect(row.getByRole("button", { name: /löschen/i })).toBeVisible();
  await expectActionsInOneLine(row);

  await row.getByRole("button", { name: /deaktivieren/i }).click();
  await expect(row.getByText("Deaktiviert", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: /aktivieren/i }).click();
  await expect(row.getByText("Aktiv", { exact: true })).toBeVisible();
});

test("erstellt leichte, mittlere und komplexe Plugins im Code-Modus", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  const variants = [
    { name: "Code Leicht", slug: "code-light", files: [] },
    { name: "Code Mittel", slug: "code-medium", files: ["config.json"] },
    { name: "Code Komplex", slug: "code-complex", files: ["config.json", "schema/state.json", "assets/info.txt"] },
  ];

  for (const variant of variants) {
    await openMaker(page, "Mit Code erstellen");
    await fillIdentity(page, variant.name, variant.slug);
    for (const file of variant.files) {
      await page.getByLabel("Neue Plugin-Datei").fill(file);
      await page.getByRole("button", { name: "Datei", exact: true }).click();
      await page.getByLabel(`Inhalt ${file}`).fill(file.endsWith(".json") ? "{}\n" : "E2E-Inhalt\n");
    }
    if (variant.files.length > 1) {
      await page.getByRole("checkbox", { name: /Dashboard/i }).check();
      await page.getByRole("button", { name: "Fähigkeit hinzufügen" }).click();
    }
    await activateAndOpen(page, variant.name, variant.slug);
  }
});
