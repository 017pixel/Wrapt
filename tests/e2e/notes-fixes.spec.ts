import { expect, test } from "@playwright/test";
import { apiIdentityHeaders, workbenchUrl } from "./helpers/environment";

const headers = apiIdentityHeaders("user@example.com");
test.use({ extraHTTPHeaders: headers, viewport: { width: 1440, height: 960 }, video: "on" });

for (const parentOpen of [false, true]) {
  test(`Enter, Bash und Verschieben mit ${parentOpen ? "offener" : "geschlossener"} Zielseite`, async ({ page, request }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const create = async (title: string) => {
      const response = await request.post("/api/v1/notes", { headers, data: { title } });
      expect(response.ok()).toBe(true);
      return (await response.json()).note;
    };
    const stamp = Date.now();
    const parent = await create(`Sammlung ${parentOpen} ${stamp}`);
    const child = await create(`Lernplattform ${parentOpen} ${stamp}`);
    await page.goto(`${workbenchUrl}/notizen?note=${parent.id}`);
    const title = page.getByLabel("Notiztitel");
    await title.fill(parent.title);
    await title.press("Enter");
    const editor = page.getByTestId("note-editor");
    await expect(editor).toBeFocused();
    await page.keyboard.type("Hier geht es direkt weiter.");
    await expect(editor).toContainText("Hier geht es direkt weiter.");
    await expect.poll(async () => (await (await request.get(`/api/v1/notes/${parent.id}`, { headers })).json()).note.content).toContain("Hier geht es direkt weiter.");
    if (!parentOpen) {
      await page.goto(`${workbenchUrl}/notizen?note=${child.id}`);
      await expect(title).toHaveValue(child.title);
    } else {
      // Der Link muss den noch offenen lokalen Entwurf erhalten.
      await editor.click();
      await page.keyboard.press("End");
      await page.keyboard.type(" Mit Entwurf.");
    }
    const sourceRow = page.locator(".notes-tree-row").filter({ has: page.getByRole("button", { name: child.title, exact: true }) });
    await sourceRow.hover();
    await sourceRow.getByRole("button", { name: "Seitenaktionen" }).click();
    await page.getByRole("menuitem", { name: "Verschieben nach …" }).click();
    await page.getByRole("dialog").getByRole("button", { name: parent.title, exact: true }).click();
    await expect.poll(async () => (await (await request.get(`/api/v1/notes/${parent.id}`, { headers })).json()).note.content).toContain(child.id);
    await page.goto(`${workbenchUrl}/notizen?note=${parent.id}`);
    await expect(editor).toContainText("Hier geht es direkt weiter.");
    if (parentOpen) await expect(editor).toContainText("Mit Entwurf.");
    const mention = editor.locator(".note-mention");
    await expect(mention).toHaveCount(1);
    await expect(mention).toContainText(child.title);
    await page.screenshot({ path: `temp/notes-fixes/unterseite-${parentOpen}.png` });
    await mention.click();
    await expect(title).toHaveValue(child.title);
    const detail = (await (await request.get(`/api/v1/notes/${child.id}`, { headers })).json()).note;
    const save = await request.put(`/api/v1/notes/${child.id}/content`, { headers, data: {
      content: '```bash\necho "Hallo"\n```\n\nWeiter schreiben.', expectedRevision: detail.revision,
    } });
    expect(save.ok()).toBe(true);
    await page.reload();
    await expect(editor.locator("pre")).toContainText('echo "Hallo"');
    await expect(editor.locator(".hljs-built_in")).toBeVisible();
    await title.click();
    await title.press("Enter");
    await expect(editor).toBeFocused();
    expect(errors).toEqual([]);
    await page.screenshot({ path: `temp/notes-fixes/bash-${parentOpen}.png` });
  });
}
