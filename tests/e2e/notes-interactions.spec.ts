import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { apiIdentityHeaders, workbenchUrl } from "./helpers/environment";

const headers = apiIdentityHeaders("user@example.com");
test.use({ extraHTTPHeaders: headers, viewport: { width: 1440, height: 960 } });

/**
 * Teilsichtbarkeit reicht nicht: `isVisible` ist schon bei einem Pixel
 * erfüllt, `dragTo` scrollt dann während des Ziehens nach — und Scrollen
 * während des Ziehens lässt WebKit den Drop daneben landen (z. B. auf einem
 * Abschnitts-Toggle statt auf der Zeile).
 */
async function fullyVisible(locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  if (!box || box.width === 0 || box.height === 0) return false;
  return locator.evaluate((element, rect) => {
    const scroller = element.closest(".notes-sidebar-scroll");
    const view = (scroller ?? document.documentElement).getBoundingClientRect();
    return (
      rect.x >= view.x - 1 &&
      rect.y >= view.y - 1 &&
      rect.x + rect.width <= view.x + view.width + 1 &&
      rect.y + rect.height <= view.y + view.height + 1 &&
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.width <= window.innerWidth + 1 &&
      rect.y + rect.height <= window.innerHeight + 1
    );
  }, box);
}

/**
 * Quelle und Ziel gleichzeitig vollständig sichtbar halten: `dragTo` scrollt
 * die Quelle noch vor `mousedown` (harmlos), das Ziel aber danach. Alle
 * Scrolls passieren deshalb hier vorher.
 */
async function prepareDrag(page: Page, source: Locator, target: Locator) {
  for (let i = 0; i < 6; i++) {
    await target.scrollIntoViewIfNeeded();
    await source.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    if ((await fullyVisible(target)) && (await fullyVisible(source))) break;
  }
  expect(await fullyVisible(source)).toBe(true);
  expect(await fullyVisible(target)).toBe(true);
}

/**
 * Ziehen mit Zielprüfung: Nach `mousedown` (Drag-Status, Animationen) kann
 * sich das Layout noch setzen. Deshalb werden die Zielkoordinaten unmittelbar
 * vor dem Loslassen neu gelesen und die angezeigte Drop-Zone geprüft — ein
 * stiller Fehl-Drop fiele sonst erst viel später an den API-Daten auf.
 */
async function dragNoteToRow(
  page: Page,
  source: Locator,
  target: Locator,
  zone: "inside" | "before" | "after",
  targetPosition?: { x: number; y: number },
) {
  await prepareDrag(page, source, target);
  const point = async () => {
    const box = await target.boundingBox();
    return {
      x: targetPosition ? box!.x + targetPosition.x : box!.x + box!.width / 2,
      y: targetPosition ? box!.y + targetPosition.y : box!.y + box!.height / 2,
    };
  };
  const from = await source.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  const first = await point();
  await page.mouse.move(first.x, first.y, { steps: 10 });
  const second = await point();
  await page.mouse.move(second.x, second.y, { steps: 3 });
  await expect(target).toHaveClass(new RegExp(`is-drop-${zone}`));
  await page.mouse.up();
}
async function createNote(request: APIRequestContext, title: string, extra: Record<string, unknown> = {}) {
  const response = await request.post("/api/v1/notes", { headers, data: { title, ...extra } });
  expect(response.ok()).toBe(true);
  return (await response.json()).note;
}

test("Ordner, Favoriten, Drag-and-drop und gespeicherte Abschnittsreihenfolge", async ({ page, request }) => {
  const unique = Date.now().toString(36);
  await page.goto(`${workbenchUrl}/notizen`);
  await page.getByRole("button", { name: "Neuer Ordner", exact: true }).click();
  const folderName = `Gedanken ${unique}`;
  await page.getByLabel("Ordnername").fill(folderName);
  await page.getByRole("button", { name: "Erstellen", exact: true }).click();
  await page.getByRole("button", { name: `Neue Seite in ${folderName}`, exact: true }).click();
  await page.getByLabel("Notiztitel").fill(`Idee ${unique}`);
  await page.getByLabel("Notiztitel").blur();
  await expect(page.locator(".notes-note-current")).toHaveText(`Idee ${unique}`);
  const first = new URL(page.url()).searchParams.get("note");
  await page.getByRole("button", { name: "Neue Seite in Favoriten", exact: true }).click();
  await expect(page.getByRole("button", { name: "Favorit entfernen", exact: true })).toBeVisible();
  await page.getByLabel("Notiztitel").fill(`Favorit ${unique}`);
  await page.getByLabel("Notiztitel").blur();
  await expect(page.locator(".notes-note-current")).toHaveText(`Favorit ${unique}`);
  const favoriteId = new URL(page.url()).searchParams.get("note");
  await page.locator('[data-section="all"] .notes-group-toggle').click();
  const source = page.locator(`[data-section="favorites"] [data-favorite-id="${favoriteId}"]`);
  const folder = page.locator("[data-section]").filter({ has: page.getByRole("button", { name: folderName, exact: true }) });
  const folderToggle = folder.locator(".notes-group-toggle");
  const recentToggle = page.locator('[data-section="recent"] .notes-group-toggle');
  const favoritesToggle = page.locator('[data-section="favorites"] .notes-group-toggle');
  await prepareDrag(page, source, folderToggle);
  await source.dragTo(folderToggle);
  await expect(folder.getByRole("button", { name: `Favorit ${unique}`, exact: true })).toBeVisible();
  await prepareDrag(page, favoritesToggle, recentToggle);
  await favoritesToggle.dragTo(recentToggle);
  await page.reload();
  await expect(page.locator('.notes-sidebar [data-section]').first()).toHaveAttribute("data-section", "favorites");
  await expect(folder.getByRole("button", { name: `Favorit ${unique}`, exact: true })).toBeVisible();
  await folder.getByRole("button", { name: `${folderName}: Ordneraktionen` }).click();
  await page.getByRole("menuitem", { name: "Ordner auflösen" }).click();
  await expect(page.getByRole("button", { name: folderName, exact: true })).toHaveCount(0);
  const note = await request.get(`/api/v1/notes/${first}`, { headers });
  expect((await note.json()).note).toMatchObject({ folderId: null, archived: false });
});

test("freie Editorfläche und große Bilder halten Cursor und Blockgriff am Inhalt", async ({ page, request }) => {
  const note = await createNote(request, `Bild ${Date.now()}`);
  const image = await request.post("/api/v1/orbit/assets", { headers, multipart: { file: {
    name: "test.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="1000"><rect width="420" height="1000" fill="white"/></svg>'),
  } } });
  expect(image.ok()).toBe(true);
  const asset = await image.json();
  await request.put(`/api/v1/notes/${note.id}/content`, { headers, data: { content: `![Großes Bild](/api/v1/orbit/assets/${asset.asset?.id ?? asset.id})`, expectedRevision: note.revision } });
  await page.goto(`${workbenchUrl}/notizen?note=${note.id}`);
  const img = page.locator(".note-editor-content img");
  await expect(img).toBeVisible();
  await img.hover({ position: { x: 120, y: 150 } });
  const handle = page.getByRole("button", { name: "Block-Menü öffnen", exact: true });
  await expect(handle).toBeVisible();
  const before = await handle.boundingBox();
  await img.hover({ position: { x: 180, y: 350 } });
  const after = await handle.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
  const header = await page.locator(".notes-note-head").boundingBox();
  expect(before!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  await page.locator(".notes-editor-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const frame = page.locator(".notes-editor-frame");
  const box = await frame.boundingBox();
  await frame.click({ position: { x: box!.width / 2, y: box!.height - 12 } });
  await page.keyboard.type("Gedanke unter dem Bild");
  await expect(page.locator(".note-editor-content")).toContainText("Gedanke unter dem Bild");
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();
  await expect.poll(async () => (await (await request.get(`/api/v1/notes/${note.id}`, { headers })).json()).note.content).toContain("Gedanke unter dem Bild");
  await page.reload();
  await expect(page.locator(".note-editor-content")).toContainText("Gedanke unter dem Bild");
});

test("Mausrad über Seitentiteln und Verschiebezielen scrollt die jeweilige Liste", async ({ page, request }) => {
  const stamp = Date.now();
  const notes = [];
  for (let i = 0; i < 35; i += 1) notes.push(await createNote(request, `Scroll ${stamp} ${i}`));
  await page.goto(`${workbenchUrl}/notizen?note=${notes[0].id}`);
  const sidebar = page.locator(".notes-sidebar-scroll");
  await sidebar.locator(".notes-tree-label").first().hover();
  await page.mouse.wheel(0, 350);
  await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(30);
  await sidebar.evaluate((element) => { element.scrollTop = 0; });
  const row = sidebar.locator(".notes-tree-row").filter({ has: page.getByRole("button", { name: notes[0].title, exact: true }) }).first();
  await row.getByRole("button", { name: "Seitenaktionen" }).click();
  await page.getByRole("menuitem", { name: "Verschieben nach …" }).click();
  const list = page.locator(".notes-move-list");
  await list.locator(".notes-move-row-label").nth(1).hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(30);
});

test("Verschieben zwischen Ordnerbäumen, Zurückziehen und Seitenreihenfolge", async ({ page, request }) => {
  const stamp = Date.now();
  const folderA = (await (await request.post("/api/v1/notes/folders", { headers, data: { name: `Arbeit ${stamp}` } })).json()).folder;
  const folderB = (await (await request.post("/api/v1/notes/folders", { headers, data: { name: `Ideen ${stamp}` } })).json()).folder;
  const parentA = await createNote(request, `Eltern A ${stamp}`, { folderId: folderA.id });
  const parentB = await createNote(request, `Eltern B ${stamp}`, { folderId: folderB.id });
  const child = await createNote(request, `Unterseite ${stamp}`, { parentId: parentA.id });
  const root = await createNote(request, `Wurzel ${stamp}`, { folderId: folderA.id });
  await page.goto(`${workbenchUrl}/notizen?note=${child.id}`);
  const groupA = page.locator(`[data-section="folder:${folderA.id}"]`);
  const groupB = page.locator(`[data-section="folder:${folderB.id}"]`);
  const allToggle = page.locator('[data-section="all"] .notes-group-toggle');
  // Fremde Abschnitte einklappen: Notizen früherer Tests machen die Leiste so
  // lang, dass Quelle und Ziel nicht gleichzeitig sichtbar sind — dann muss
  // `dragTo` während des Ziehens scrollen. Erst auf die Ordner warten, damit
  // die Abschnittsliste vollständig geladen ist.
  await expect(groupA.getByRole("button", { name: parentA.title, exact: true })).toBeVisible();
  await expect(groupB.getByRole("button", { name: parentB.title, exact: true })).toBeVisible();
  const sidebarToggles = page.locator(".notes-sidebar [data-section] .notes-group-toggle");
  const toggleCount = await sidebarToggles.count();
  for (let i = 0; i < toggleCount; i++) {
    const toggle = sidebarToggles.nth(i);
    const section = await toggle.evaluate((element) => element.closest("[data-section]")?.getAttribute("data-section"));
    if (section === `folder:${folderA.id}` || section === `folder:${folderB.id}`) continue;
    if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
  }
  await page.waitForTimeout(300);
  const childRow = groupA.locator(".notes-tree-row").filter({ has: page.getByRole("button", { name: child.title, exact: true }) });
  const targetRow = groupB.locator(".notes-tree-row").filter({ has: page.getByRole("button", { name: parentB.title, exact: true }) });
  await dragNoteToRow(page, childRow, targetRow, "inside");
  await expect.poll(async () => (await (await request.get(`/api/v1/notes/${child.id}`, { headers })).json()).note.parentId, { timeout: 10_000 }).toBe(parentB.id);
  await expect(groupB.getByRole("button", { name: child.title, exact: true })).toBeVisible();
  const rootRow = groupA.locator(".notes-tree-row").filter({ has: page.getByRole("button", { name: root.title, exact: true }) });
  const groupBToggle = groupB.locator(".notes-group-toggle");
  await prepareDrag(page, rootRow, groupBToggle);
  await rootRow.dragTo(groupBToggle);
  await expect(groupB.getByRole("button", { name: root.title, exact: true })).toBeVisible();
  const movedRootRow = groupB.locator(".notes-tree-row").filter({ has: page.getByRole("button", { name: root.title, exact: true }) });
  const allToggleTarget = page.locator('[data-section="all"] .notes-group-toggle');
  await prepareDrag(page, movedRootRow, allToggleTarget);
  await movedRootRow.dragTo(allToggleTarget);
  await expect.poll(async () => (await (await request.get(`/api/v1/notes/${root.id}`, { headers })).json()).note.folderId, { timeout: 10_000 }).toBeNull();
  await allToggle.click();
  const all = page.locator('[data-section="all"]');
  const source = all.locator(".notes-tree-row").filter({ has: page.getByRole("button", { name: root.title, exact: true }) });
  const target = all.locator(".notes-tree-row").filter({ has: page.getByRole("button", { name: parentA.title, exact: true }) });
  await dragNoteToRow(page, source, target, "before", { x: 80, y: 2 });
  await expect.poll(async () => {
    const live = (await (await request.get("/api/v1/notes", { headers })).json()).notes as { id: string; sortOrder: number }[];
    return live.find((note) => note.id === root.id)!.sortOrder < live.find((note) => note.id === parentA.id)!.sortOrder;
  }).toBe(true);
  await page.reload();
  const current = (await (await request.get("/api/v1/notes", { headers })).json()).notes;
  expect(current.find((note: { id: string }) => note.id === root.id).sortOrder).toBeLessThan(current.find((note: { id: string }) => note.id === parentA.id).sortOrder);
});

test("mobile Notizen öffnen Ordner, Favoriten und Suche ohne Überlauf", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const note = await createNote(request, `Mobil ${Date.now()}`);
  await page.goto(`${workbenchUrl}/notizen?note=${note.id}`);
  await page.getByRole("button", { name: "Seitenleiste öffnen", exact: true }).click();
  const sidebar = page.locator(".notes-sidebar");
  await expect(sidebar.getByRole("button", { name: "Neuer Ordner", exact: true })).toBeVisible();
  for (const name of ["Neuer Ordner", "Neue Seite in Favoriten"]) {
    const box = await sidebar.getByRole("button", { name, exact: true }).boundingBox();
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
  }
  await sidebar.getByRole("button", { name: "Seitenleiste schließen", exact: true }).click();
  await page.keyboard.press("Control+k");
  await expect(page.locator(".notes-palette")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".notes-palette")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
