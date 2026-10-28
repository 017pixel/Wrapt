import { expect, test } from "@playwright/test";
import { apiIdentityHeaders, workbenchUrl } from "./helpers/environment";
import { shortcutBridgeScript } from "../../apps/server/src/services/shortcutBridge";

const headers = apiIdentityHeaders("user@example.com");
test.use({ extraHTTPHeaders: headers, viewport: { width: 1440, height: 960 } });

for (const platform of ["Win32", "MacIntel"]) {
test(`Quick Note bleibt neben einem Werkzeug bedienbar, verschiebbar und skalierbar (${platform})`, async ({ page }) => {
  await page.addInitScript((value) => Object.defineProperty(navigator, "platform", { get: () => value }), platform);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${workbenchUrl}/settings`);
  await page.getByRole("button", { name: "Quick Note öffnen", exact: true }).waitFor();
  await page.route("**/t3/notes-shortcut-fixture", (route) => route.fulfill({ contentType: "text/html", body: `<html><head>${shortcutBridgeScript}</head><body><textarea aria-label="Agent-Nachricht"></textarea></body></html>` }));
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.src = "/t3/notes-shortcut-fixture";
    frame.dataset.testid = "coding-fixture";
    Object.assign(frame.style, { position: "fixed", left: "300px", bottom: "80px", width: "500px", height: "180px", zIndex: "60" });
    document.body.append(frame);
  });
  const agent = page.frameLocator('[data-testid="coding-fixture"]').getByRole("textbox", { name: "Agent-Nachricht" });
  await agent.fill("Weiter am Code arbeiten");
  await agent.press(platform === "Win32" ? "Alt+N" : "Control+N");
  const quick = page.getByRole("dialog", { name: "Quick Note", exact: true });
  await expect(quick).toBeVisible();
  await expect(quick.locator(".quick-note-titlebar")).not.toContainText("Quick Note");
  await expect(quick.getByRole("toolbar", { name: "Notiz bearbeiten" })).toHaveCount(0);
  await expect(quick.locator(".quick-note-footer button")).toHaveCount(0);
  const title = quick.getByLabel("Notiztitel");
  await expect(title).toBeVisible();
  await title.fill("E2E Fensteridee");
  const editor = quick.locator(".note-editor-content");
  await editor.fill("Idee beim Coden festhalten");
  await expect(quick.getByRole("status")).toHaveText("Gespeichert");
  const window = page.locator(".quick-note-window");
  const before = (await window.boundingBox())!;
  const handle = quick.locator(".quick-note-titlebar span");
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + 40, handleBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 180, handleBox.y + 60, { steps: 12 });
  await page.mouse.up();
  const moved = (await window.boundingBox())!;
  expect(moved.x).toBeGreaterThan(before.x + 100);
  await page.mouse.move(moved.x + moved.width - 1, moved.y + moved.height - 1);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width + 79, moved.y + moved.height + 59, { steps: 12 });
  await page.mouse.up();
  const resized = (await window.boundingBox())!;
  expect(resized.width).toBeGreaterThan(moved.width + 50);
  expect(resized.height).toBeGreaterThan(moved.height + 40);
  await agent.fill("Agent ist weiter bedienbar");
  await expect(quick).toBeVisible();
  await expect(editor).toContainText("Idee beim Coden");
  await quick.getByRole("button", { name: "Quick Note schließen", exact: true }).click();
  await agent.press(platform === "Win32" ? "Alt+N" : "Control+N");
  await expect(quick).toBeVisible();
  await expect(editor).toContainText("Idee beim Coden");
  await expect(title).toHaveValue("E2E Fensteridee");
  await quick.getByRole("button", { name: "Im Notizen-Werkzeug öffnen", exact: true }).click();
  await expect(quick).not.toBeVisible();
  await expect(page).toHaveURL(/\/notizen\?note=/);
  await expect(page.locator(".notes-workspace .note-editor-content")).toContainText("Idee beim Coden");
  expect(errors).toEqual([]);
});

}

test("findet Tippfehler und zeigt eine Seite nur in ihrer Sammlung", async ({ page, request }) => {
  const title = `Verbindungsnotizen ${Date.now()}`;
  const folder = (await (await request.post("/api/v1/notes/folders", { headers, data: { name: "Produktivität" } })).json()).folder;
  const note = (await (await request.post("/api/v1/notes", { headers, data: { title, folderId: folder.id } })).json()).note;
  await page.goto(`${workbenchUrl}/notizen?note=${note.id}`);
  await expect(page.locator(`.notes-sidebar [data-section="folder:${folder.id}"]`)).toBeVisible();
  await expect(page.locator('.notes-sidebar [data-section="all"]')).not.toContainText(title);
  await expect(page.locator('.notes-sidebar [data-section="recent"]')).toHaveCount(0);
  await page.locator(".notes-search-row").click();
  await page.getByRole("textbox", { name: "Notizen durchsuchen" }).fill(title.replace("notizen", "notitzen"));
  await expect(page.getByRole("option", { name: new RegExp(title) })).toBeVisible();
  await page.getByRole("option", { name: new RegExp(title) }).click();
  await expect(page.getByLabel("Notiztitel")).toHaveValue(title);
});

test("stellt einen lokalen Entwurf nach Netzfehler und Neuladen wieder her", async ({ page, request }) => {
  const note = (await (await request.post("/api/v1/notes", { headers, data: { title: "Entwurfsicherung" } })).json()).note;
  await page.goto(`${workbenchUrl}/notizen?note=${note.id}`);
  const editor = page.locator(".notes-workspace .note-editor-content");
  await expect(editor).toBeVisible();
  await page.route(`**/api/v1/notes/${note.id}/content`, (route) => route.abort());
  await editor.fill("Dieser Gedanke darf beim Neuladen nicht verschwinden.");
  await expect(page.getByRole("alert").filter({ hasText: "Nicht auf dem Server gespeichert" })).toBeVisible();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await expect(editor).toContainText("Dieser Gedanke darf beim Neuladen nicht verschwinden.");
  await page.unroute(`**/api/v1/notes/${note.id}/content`);
  await page.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
  await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");
  const saved = (await (await request.get(`/api/v1/notes/${note.id}`, { headers })).json()).note;
  expect(saved.content).toContain("Dieser Gedanke darf beim Neuladen nicht verschwinden.");
});

test("übernimmt Aufgabenänderungen in die ursprüngliche Notiz und zeigt Verlauf", async ({ page, request }) => {
  const taskText = `Verbindung prüfen ${Date.now()}`;
  const note = (await (await request.post("/api/v1/notes", { headers, data: { title: "Checkliste" } })).json()).note;
  await request.put(`/api/v1/notes/${note.id}/content`, { headers, data: { content: `- [ ] ${taskText}`, expectedRevision: note.revision } });
  await page.goto(`${workbenchUrl}/notizen?note=${note.id}`);
  await page.locator(".notes-sidebar").getByRole("button", { name: "Aufgaben", exact: true }).click();
  await page.getByRole("checkbox", { name: taskText, exact: true }).check();
  await expect(page.getByRole("checkbox", { name: taskText, exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Checkliste", exact: true }).last().click();
  await expect(page.locator('.note-editor-content input[type="checkbox"]')).toBeChecked();
  await page.getByText("Eigenschaften, Verknüpfungen und Verlauf", { exact: true }).click();
  await page.getByText("Versionsverlauf", { exact: true }).click();
  await expect(page.locator(".note-knowledge").getByRole("button", { name: /Checkliste/ }).first()).toBeVisible();
});

test("importiert Markdown und bietet einen vollständigen ZIP-Export an", async ({ page }) => {
  await page.goto(`${workbenchUrl}/notizen`);
  const title = `Import-Idee ${Date.now()}`;
  await page.getByLabel("Notizen importieren").setInputFiles({ name: "Import-Idee.md", mimeType: "text/markdown", buffer: Buffer.from(`# ${title}\n\nEin Gedanke aus einer anderen Notiz-App.`) });
  await expect(page.getByRole("status").filter({ hasText: "1 Notizen importiert" })).toBeVisible();
  await page.locator(".notes-sidebar").getByRole("button", { name: title, exact: true }).click();
  await expect(page.locator(".note-editor-content")).toContainText("Ein Gedanke aus einer anderen Notiz-App.");
  await page.getByRole("button", { name: "Notizablage verwalten" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Alle Notizen exportieren" }).click();
  const archive = await download;
  expect(archive.suggestedFilename()).toMatch(/^Wrapt-Notizen-.*\.zip$/);
  expect(await archive.failure()).toBeNull();
});

test("zeigt [[-Vorschläge und Slash-Menüs im richtigen Editor", async ({ page }) => {
  await page.goto(`${workbenchUrl}/notizen`);
  await page.getByRole("button", { name: "Quick Note öffnen", exact: true }).click();
  const quick = page.getByRole("dialog", { name: "Quick Note", exact: true });
  const editor = quick.locator(".note-editor-content");
  await editor.click();
  await editor.pressSequentially("/code");
  await expect(page.getByRole("listbox", { name: "Befehle", exact: true })).toHaveCount(1);
  await page.getByRole("option", { name: /Codeblock/ }).click();
  await expect(quick.locator(".note-code-block")).toBeVisible();
  await quick.getByRole("button", { name: "Quick Note schließen", exact: true }).click();
  await page.locator(".notes-sidebar-new").filter({ hasText: "Neue Seite" }).first().click();
  const main = page.locator(".notes-workspace .note-editor-content");
  await main.click();
  await main.pressSequentially("[[");
  await expect(page.getByRole("dialog", { name: "Seite verlinken" })).toBeVisible();
});

test("nimmt Verschieben samt neuem Elternverweis zurück", async ({ page, request }) => {
  const stamp = Date.now();
  const source = (await (await request.post("/api/v1/notes", { headers, data: { title: `Undo Quelle ${stamp}` } })).json()).note;
  const target = (await (await request.post("/api/v1/notes", { headers, data: { title: `Undo Ziel ${stamp}` } })).json()).note;
  await page.goto(`${workbenchUrl}/notizen?note=${source.id}`);
  const row = page.locator(".notes-tree-row").filter({ has: page.getByRole("button", { name: source.title, exact: true }) });
  await row.getByRole("button", { name: "Seitenaktionen", exact: true }).click();
  await page.getByRole("menuitem", { name: /Verschieben nach/ }).click();
  const dialog = page.getByRole("dialog", { name: /verschieben/i });
  await dialog.getByRole("button", { name: new RegExp(target.title) }).click();
  await expect(page.locator(".notes-undo")).toContainText("Seite verschoben");
  await expect.poll(async () => (await (await request.get(`/api/v1/notes/${target.id}`, { headers })).json()).note.content).toContain(source.id);
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/v1/notes/${source.id}`, { headers })).json()).note.parentId).toBeNull();
  await expect.poll(async () => (await (await request.get(`/api/v1/notes/${target.id}`, { headers })).json()).note.content).not.toContain(source.id);
});

test("ZIP-Rundlauf erhält Hierarchie, Eigenschaften, Links und Anhänge", async ({ page, request }) => {
  const stamp = Date.now();
  const parent = (await (await request.post("/api/v1/notes", { headers, data: { title: `Archiv Eltern ${stamp}` } })).json()).note;
  const child = (await (await request.post("/api/v1/notes", { headers, data: { title: `Archiv Kind ${stamp}`, parentId: parent.id } })).json()).note;
  const assetResponse = await request.post("/api/v1/media", { headers, multipart: { file: { name: "notiz.txt", mimeType: "text/plain", buffer: Buffer.from("Dieser Anhang gehört zur Notiz.") } } });
  expect(assetResponse.ok()).toBe(true);
  const asset = (await assetResponse.json()).asset;
  await request.put(`/api/v1/notes/${parent.id}/content`, { headers, data: { content: `[noteMention noteId="${child.id}" label="Kind"]\n\n[Anhang](https://old-wrapt.invalid/api/v1/media/${asset.id})`, expectedRevision: parent.revision } });
  await request.put(`/api/v1/notes/${parent.id}/metadata`, { headers, data: { projectId: "wrapt", tags: ["Archivtest"] } });
  await page.goto(`${workbenchUrl}/notizen?note=${parent.id}`);
  await page.getByRole("button", { name: "Notizablage verwalten" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Alle Notizen exportieren" }).click();
  const archive = await download;
  const stream = await archive.createReadStream();
  if (!stream) throw new Error("Export fehlt");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await page.getByLabel("Notizen importieren").setInputFiles({ name: "Notizen.zip", mimeType: "application/zip", buffer: Buffer.concat(chunks) });
  await expect(page.getByRole("status").filter({ hasText: /Notizen importiert/ })).toBeVisible({ timeout: 30_000 });
  const list = (await (await request.get("/api/v1/notes", { headers })).json()).notes;
  const restoredParent = list.find((note: { id: string; title: string }) => note.id !== parent.id && note.title === parent.title);
  const restoredChild = list.find((note: { id: string; title: string }) => note.id !== child.id && note.title === child.title);
  expect(restoredChild.parentId).toBe(restoredParent.id);
  const detail = (await (await request.get(`/api/v1/notes/${restoredParent.id}`, { headers })).json()).note;
  expect(detail.content).toContain(restoredChild.id);
  expect(detail.content).not.toContain("old-wrapt.invalid");
  const newAssetId = /\/api\/v1\/media\/([a-f\d-]+)/.exec(detail.content)![1];
  expect(await (await request.get(`/api/v1/media/${newAssetId}`, { headers })).text()).toBe("Dieser Anhang gehört zur Notiz.");
  expect((await (await request.get(`/api/v1/notes/${restoredParent.id}/metadata`, { headers })).json()).metadata).toEqual({ projectId: "wrapt", tags: ["Archivtest"] });
});

test("öffnet die Quick Note auch aus der Aufgabenansicht im vollständigen Editor", async ({ page }) => {
  await page.goto(`${workbenchUrl}/notizen`);
  await page.locator(".notes-sidebar").getByRole("button", { name: "Aufgaben", exact: true }).click();
  await page.getByRole("button", { name: "Quick Note öffnen", exact: true }).click();
  const quick = page.getByRole("dialog", { name: "Quick Note", exact: true });
  await quick.locator(".note-editor-content").fill("Gedanke aus der Aufgabenansicht");
  await quick.getByRole("button", { name: "Im Notizen-Werkzeug öffnen" }).click();
  await expect(page.locator(".notes-workspace .note-editor-content")).toContainText("Gedanke aus der Aufgabenansicht");
  await expect(page.locator(".notes-task-view")).toHaveCount(0);
});
