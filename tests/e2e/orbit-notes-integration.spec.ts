import { expect, test, type Page } from "@playwright/test";
import { apiIdentityHeaders, workbenchUrl } from "./helpers/environment";
import { resetOrbitTestWorkspace } from "./helpers/orbit";

const login = "orbit-notes@example.com";
const origin = process.env.WRAPT_E2E_URL ?? "http://127.0.0.1:3010";
const orbitUrl = new URL("/api/v1/orbit", origin).toString();

test.use({ extraHTTPHeaders: apiIdentityHeaders(login) });

test.beforeEach(async () => {
  test.skip(
    !process.env.WRAPT_E2E_URL || process.env.WRAPT_E2E_ISOLATED !== "true",
    "Orbit-Notes-E2E benötigt einen explizit isolierten Wrapt-Testserver.",
  );
});

async function createNote(page: Page, title: string, content?: string): Promise<string> {
  const previousId = new URL(page.url()).searchParams.get("note");
  await page.locator(".notes-sidebar .notes-sidebar-new").click();
  await expect.poll(() => new URL(page.url()).searchParams.get("note")).not.toBe(previousId);
  const titleInput = page.getByLabel("Notiztitel");
  await expect(titleInput).toHaveValue(/^Notiz – /, { timeout: 10_000 });
  await titleInput.fill(title);
  await titleInput.blur();

  if (content !== undefined) {
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();
    await editor.pressSequentially(content);
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");
  }

  const noteId = new URL(page.url()).searchParams.get("note");
  if (!noteId) throw new Error("Die neu erstellte Notiz-ID fehlt in der URL.");
  await expect.poll(async () => (await noteFromApi(page, noteId)).title).toBe(title);
  return noteId;
}

async function noteFromApi(page: Page, noteId: string) {
  const response = await page.request.get(`${origin}/api/v1/notes/${noteId}`, {
    headers: apiIdentityHeaders(login),
  });
  await expect(response).toBeOK();
  return (await response.json()).note as { id: string; title: string; content: string; parentId: string | null };
}

test("leitet den alten Orbit-Einstieg mit Query und Hash weiter", async ({ page }) => {
  await page.goto(`${workbenchUrl}/workbench?board=team&focus=node-4#canvas`);
  await expect(page).toHaveURL(`${workbenchUrl}/orbit?board=team&focus=node-4#canvas`);
  await expect(page.locator(".orbit-page")).toBeVisible();
});

test("erstellt eine globale Quicknote ohne Orbit-Knoten oder Rückverweis", async ({ page }) => {
  await resetOrbitTestWorkspace(page, login);
  const beforeResponse = await page.request.get(orbitUrl, { headers: apiIdentityHeaders(login) });
  const before = await beforeResponse.json() as { revision: number; document: { boards: Array<{ nodes: Array<{ id: string; noteId?: string | null }> }> } };
  const existingNodeIds = before.document.boards.flatMap((board) => board.nodes.map((node) => node.id));

  await page.goto(`${workbenchUrl}/orbit`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await page.getByRole("button", { name: "Globale Notiz erstellen" }).click();
  await expect(page).toHaveURL(/\/wrapt\/orbit\/notizen\?note=[\w-]+$/);
  await expect(page.locator(".notes-workspace")).toBeVisible();

  const noteId = new URL(page.url()).searchParams.get("note");
  expect(noteId).toBeTruthy();
  await expect(page.getByLabel("Notiztitel")).toHaveValue("Schnellnotiz");
  const noteResponse = await page.request.get(`${origin}/api/v1/notes/${noteId}`, { headers: apiIdentityHeaders(login) });
  await expect(noteResponse).toBeOK();
  const note = (await noteResponse.json()).note as Record<string, unknown>;
  expect(note.parentId).toBeNull();
  expect(note).not.toHaveProperty("orbitId");

  const afterResponse = await page.request.get(orbitUrl, { headers: apiIdentityHeaders(login) });
  const after = await afterResponse.json() as { revision: number; document: { boards: Array<{ nodes: Array<{ id: string; noteId?: string | null }> }> } };
  expect(after.document.boards.flatMap((board) => board.nodes.map((node) => node.id))).toEqual(existingNodeIds);
  expect(after.document.boards.some((board) => board.nodes.some((node) => node.noteId === noteId))).toBe(false);
  expect(after.revision).toBe(before.revision);
});

test("behält dieselbe Notes-ID und Aktionen zwischen Standalone und Orbit", async ({ page }) => {
  const stamp = Date.now().toString();
  const targetTitle = `Orbit-Notes-Ziel ${stamp}`;
  const sourceTitle = `Orbit-Notes-Quelle ${stamp}`;
  const editedTitle = `Orbit-Notes-Gespeichert ${stamp}`;
  const searchMarker = `Standalone-Suchmarker-${stamp}`;
  const orbitMarker = `Orbit-Gespeichert-${stamp}`;
  let targetId: string | null = null;
  let sourceId: string | null = null;

  try {
    await page.goto(`${workbenchUrl}/notizen`);
    await expect(page.locator(".notes-workspace")).toBeVisible();
    targetId = await createNote(page, targetTitle);
    sourceId = await createNote(page, sourceTitle, searchMarker);

    await page.keyboard.press("ControlOrMeta+k");
    const standalonePalette = page.locator(".notes-palette");
    await expect(standalonePalette).toBeVisible();
    await standalonePalette.getByLabel("Notizen durchsuchen").fill(searchMarker);
    await expect(standalonePalette.getByRole("option", { name: new RegExp(sourceTitle) })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(standalonePalette).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("note")).toBe(sourceId);

    await page.getByLabel("Notiztitel").fill(editedTitle);
    await page.getByLabel("Notiztitel").blur();
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();
    await editor.press("ControlOrMeta+End");
    await editor.pressSequentially(` ${searchMarker}-gespeichert`);
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");
    await expect.poll(async () => (await noteFromApi(page, sourceId!)).title).toBe(editedTitle);

    await page.goto(`${workbenchUrl}/orbit/notizen?note=${encodeURIComponent(sourceId)}`);
    await expect(page.locator(".notes-workspace")).toBeVisible();
    await expect(page.getByLabel("Notiztitel")).toHaveValue(editedTitle);
    await expect(page.locator(".notes-workspace .note-editor-content").first()).toContainText(`${searchMarker}-gespeichert`);
    await expect.poll(() => new URL(page.url()).searchParams.get("note")).toBe(sourceId);

    await page.keyboard.press("ControlOrMeta+k");
    const orbitPalette = page.locator(".notes-palette");
    await expect(orbitPalette).toBeVisible();
    await orbitPalette.getByLabel("Notizen durchsuchen").fill(editedTitle);
    await expect(orbitPalette.getByRole("option", { name: new RegExp(editedTitle) })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(orbitPalette).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("note")).toBe(sourceId);

    const orbitEditor = page.locator(".notes-workspace .note-editor-content").first();
    await orbitEditor.click();
    await orbitEditor.press("ControlOrMeta+End");
    await orbitEditor.pressSequentially(` ${orbitMarker}`);
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");
    await expect.poll(async () => (await noteFromApi(page, sourceId!)).content).toContain(orbitMarker);

    await page.locator(".notes-sidebar .notes-tree-row.is-active")
      .getByRole("button", { name: "Seitenaktionen" })
      .click();
    await page.getByRole("menuitem", { name: "Verschieben nach …" }).click();
    const moveDialog = page.getByRole("dialog", { name: `${editedTitle} verschieben` });
    await expect(moveDialog).toBeVisible();
    await moveDialog.locator(".notes-move-row").filter({ hasText: targetTitle }).click();
    await expect(moveDialog).toHaveCount(0);
    await expect.poll(async () => (await noteFromApi(page, sourceId!)).parentId).toBe(targetId);

    await page.goto(`${workbenchUrl}/notizen?note=${encodeURIComponent(sourceId)}`);
    await expect(page.locator(".notes-workspace")).toBeVisible();
    await expect(page.getByLabel("Notiztitel")).toHaveValue(editedTitle);
    await expect(page.locator(".notes-workspace .note-editor-content").first()).toContainText(orbitMarker);
    await expect(page.locator(".notes-note-crumbs")).toContainText(targetTitle);
    await expect.poll(() => new URL(page.url()).searchParams.get("note")).toBe(sourceId);
  } finally {
    for (const noteId of [sourceId, targetId]) {
      if (noteId === null) continue;
      await page.request.delete(`${origin}/api/v1/notes/${noteId}`, {
        headers: apiIdentityHeaders(login),
      }).catch(() => undefined);
    }
  }
});
