import { mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";
import { workbenchUrl } from "./helpers/environment";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

test("öffnet echte Dateien, aktualisiert atomare Änderungen und erhält ungespeicherte Eingaben", async ({ page, request }) => {
  const root = process.env.WRAPT_E2E_ROOT;
  test.skip(process.env.WRAPT_E2E_EDITOR_LIVE !== "true" || !root, "Benötigt einen ausdrücklich isolierten VS-Code-Testserver.");
  if (!resolve(root!).startsWith(`${resolve(tmpdir())}/`)) throw new Error("Editor-Live-Test benötigt einen eigenen Temp-Root.");
  const folder = await mkdtemp(join(root!, "editor-live-"));
  const file = join(folder, "datei.ts"), second = join(folder, "zweite.txt");
  await writeFile(file, 'export const value = "Anfang";\n');
  await writeFile(second, "Zweite Datei\n");
  const token = (await readFile(join(root!, "data/editor-open-capability"), "utf8")).trim();
  const open = async (path: string) => {
    const response = await request.post(`${new URL(workbenchUrl).origin}/api/v1/editor/open`, {
      headers: { authorization: `Bearer ${token}` }, data: { path, line: 1, column: 4 },
    });
    expect(response.status()).toBe(202);
  };
  await page.goto(`${workbenchUrl}/code-editor?${new URLSearchParams({ folder })}`);
  const editor = page.frameLocator('iframe[title="Editor"]');
  await editor.locator(".monaco-workbench").waitFor({ state: "visible" });
  await expect(page.locator(".editor-frame-notice")).toHaveCount(0, { timeout: 30_000 });
  await open(file);
  const lines = editor.locator(".editor-instance .monaco-editor .view-lines").first();
  await expect(lines).toContainText("Anfang");
  await writeFile(`${file}.tmp`, 'export const value = "Atomar";\n');
  await rename(`${file}.tmp`, file);
  await expect(lines).toContainText("Atomar");
  await editor.getByRole("textbox", { name: "datei.ts", exact: true }).press("Control+End");
  await page.keyboard.insertText("\n// Ungespeichert");
  await open(second);
  await expect(lines).toContainText("Zweite");
  await editor.getByRole("tab", { name: "datei.ts", exact: true }).click();
  await expect(lines).toContainText("Ungespeichert");
  const frame = await page.locator('iframe[title="Editor"]').elementHandle();
  await page.locator('a[href$="/projects"]').first().click();
  await page.locator('a[href$="/code-editor"]').first().click();
  expect(await frame!.evaluate((element) => element === document.querySelector('iframe[title="Editor"]'))).toBe(true);
  await expect(lines).toContainText("Ungespeichert");
});
