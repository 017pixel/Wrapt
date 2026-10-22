import { expect, test } from "@playwright/test";
import { apiIdentityHeaders, workbenchUrl } from "./helpers/environment";

test.use({ serviceWorkers: "block", extraHTTPHeaders: apiIdentityHeaders("user@example.com") });

test("speichert Plugin-Entwürfe nur bei Änderungen und erhält Eingaben während eines laufenden Saves", async ({ page }) => {
  await page.goto(`${workbenchUrl}/plugins`);
  await page.getByRole("button", { name: "Neues Plugin erstellen", exact: true }).click();
  await page.getByRole("dialog", { name: "Neues Plugin erstellen" }).getByRole("button", { name: /Visuell erstellen/ }).click();
  const name = page.locator("section.plugin-maker-panel").filter({ has: page.getByRole("heading", { name: "Plugin definieren" }) }).getByLabel("Name", { exact: true });
  await expect(name).toBeVisible();
  await expect(page).toHaveURL(/draft=/);
  let saves = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route("**/api/v1/plugins/drafts/*", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    saves += 1;
    const response = await route.fetch();
    if (!held) { held = true; await gate; }
    await route.fulfill({ response });
  });
  try {
    await name.fill("Erste Fassung");
    await expect.poll(() => held).toBe(true);
    await name.fill("Neue Fassung während des Speicherns");
    release();
    await expect(name).toHaveValue("Neue Fassung während des Speicherns");
    await expect.poll(() => saves).toBe(2);
    await page.waitForTimeout(3_000);
    expect(saves).toBe(2);
    await page.reload();
    await expect(name).toHaveValue("Neue Fassung während des Speicherns");
  } finally { release(); }
});
