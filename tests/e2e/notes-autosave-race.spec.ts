import { expect, test } from "@playwright/test";
import { workbenchUrl } from "./helpers/environment";

test.use({ serviceWorkers: "block", extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

test("behält schnelle Löschungen und neue Eingaben bei verzögerter Speicherbestätigung", async ({ page }) => {
  await page.goto(workbenchUrl + "/notizen");
  await page.getByRole("complementary", { name: "Notizen", exact: true }).getByRole("button", { name: "Neue Seite", exact: true }).click();
  const editor = page.locator(".note-editor-content").first();
  await expect(editor).toBeVisible();
  let release!: () => void;
  let captured = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route("**/api/v1/notes/*/content", async (route) => {
    if (held || route.request().method() !== "PUT") return route.continue();
    held = true;
    const response = await route.fetch();
    captured = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await editor.click();
    await editor.pressSequentially("Alter Entwurf");
    await expect.poll(() => captured, { timeout: 10_000 }).toBe(true);
    await editor.press("ControlOrMeta+a");
    await editor.press("Backspace");
    await editor.pressSequentially("Neue Fassung");
    release();
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");
    await expect(editor).toHaveText("Neue Fassung");
    // Die Bestätigung darf auch die Cursorposition nicht verschieben.
    await editor.pressSequentially(" bleibt");
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");
    await expect(editor).toHaveText("Neue Fassung bleibt");
    await page.unroute("**/api/v1/notes/*/content");
    await page.reload();
    await expect(editor).toHaveText("Neue Fassung bleibt");
  } finally {
    release();
  }
});
