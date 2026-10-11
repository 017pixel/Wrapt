import { test, expect } from "./personas";
import { assertHealthy, createNote, noteLifecycle, openPage, renameNote } from "./flows";
import { getJson } from "./server";

test("leerer Titel überschreibt die gespeicherte Notiz nicht", async ({ page, api, appErrors }) => {
  const id = await createNote(page, "Titel bleibt erhalten");
  await page.getByRole("textbox", { name: "Notiztitel" }).fill("   ");
  await page.getByRole("textbox", { name: "Notiztitel" }).blur();
  expect((await getJson(api, `/notes/${id}`)).note.title).toBe("Titel bleibt erhalten");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Notiztitel" })).toHaveValue("Titel bleibt erhalten");
  await assertHealthy(page, appErrors);
});

test("lange Titel sind auf die Vertragsgrenze begrenzt und bleiben nach Reload erhalten", async ({ page, api, appErrors }) => {
  const id = await createNote(page, "Lange Eingabe");
  const title = page.getByRole("textbox", { name: "Notiztitel" });
  await expect(title).toHaveAttribute("maxlength", "300");
  await title.fill("L".repeat(500));
  await title.blur();
  await expect.poll(async () => (await getJson(api, `/notes/${id}`)).note.title.length).toBe(300);
  await page.reload();
  await expect(title).toHaveValue("L".repeat(300));
  await assertHealthy(page, appErrors);
});

test("ungültige API-Eingaben verändern keine vorhandenen Daten", async ({ page, api, appErrors }) => {
  const id = await createNote(page, "Validierung");
  for (const title of ["", " ", "x".repeat(301), { value: "kein Text" }]) {
    const invalid = await api.patch(`/api/v1/notes/${id}`, { data: { title } });
    expect(invalid.status()).toBe(400);
    expect((await getJson(api, `/notes/${id}`)).note.title).toBe("Validierung");
  }
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Notiztitel" })).toHaveValue("Validierung");
  await assertHealthy(page, appErrors);
});

test("leerer Arbeitsflächenname deaktiviert Speichern und Abbrechen erhält den alten Namen", async ({ page, appErrors }) => {
  await openPage(page, "/orbit");
  const current = await page.getByRole("button", { name: /^Arbeitsfläche:/ }).getAttribute("aria-label");
  await page.getByRole("button", { name: "Arbeitsfläche umbenennen", exact: true }).click();
  await page.getByRole("textbox", { name: "Name der Arbeitsfläche" }).fill(" ");
  await expect(page.getByRole("button", { name: "Arbeitsfläche umbenennen speichern" })).toBeDisabled();
  await page.getByRole("button", { name: "Umbenennen abbrechen", exact: true }).click();
  await expect(page.getByRole("button", { name: current!, exact: true })).toBeVisible();
  await assertHealthy(page, appErrors);
});

test("Doppelklick und Absenden während Theme-Speichern erzeugen nur eine Mutation", async ({ page, api, appErrors }) => {
  await openPage(page, "/settings#einstellungen:design");
  await page.getByRole("button", { name: "Ember", exact: true }).click();
  let mutations = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/system/appearance", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    mutations++;
    await held;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Theme speichern", exact: true }).click({ clickCount: 2 });
    const pending = page.getByRole("button", { name: "Speichert", exact: true });
    await expect(pending).toBeDisabled();
    const box = await pending.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    expect(mutations).toBe(1);
  } finally { release(); }
  await expect(page.getByText("Theme gespeichert.", { exact: true })).toBeVisible();
  expect((await getJson(api, "/system/appearance")).theme.preset).toBe("ember");
  await assertHealthy(page, appErrors);
});

test("Serverfehler zeigt Wiederholen, danach lädt das Projekt und Notizen bleiben bedienbar", async ({ page, api, appErrors }) => {
  await page.route("**/api/v1/projects", (route) => route.fulfill({ status: 500, json: { error: { code: "TEST_FAILURE", message: "Testfehler" } } }));
  await openPage(page, "/projects");
  await expect(page.getByRole("alert").filter({ hasText: "Daten konnten nicht geladen werden" })).toBeVisible();
  await page.unroute("**/api/v1/projects");
  await page.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
  await expect(page.getByRole("link", { name: /Wrapt/ }).first()).toBeVisible();
  await noteLifecycle(page, api, "Nach Fehler wieder online");
  expect(appErrors.filter((message) => !/^Failed to load resource: the server responded with a status of 500/.test(message)
    && !/^WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/api\/v1\/(editor|notifications)\/ws.*failed:/.test(message))).toEqual([]);
});

test("Löschen und Browser-Zurück zeigt Papierkorb statt leerer oder abgestürzter Seite", async ({ page, api, appErrors }) => {
  const id = await createNote(page, "Zurück nach Löschen");
  await page.getByRole("button", { name: "Weitere Aktionen", exact: true }).click();
  await page.getByRole("menuitem", { name: "In den Papierkorb", exact: true }).click();
  await expect.poll(async () => (await getJson(api, `/notes/${id}`)).note.archived).toBe(true);
  await openPage(page, "/projects");
  await page.goBack();
  await expect(page.getByTestId("notes-workspace")).toBeVisible();
  await openPage(page, `/notizen?note=${id}`);
  await expect(page.getByRole("button", { name: "Wiederherstellen", exact: true })).toBeVisible();
  await assertHealthy(page, appErrors);
});

test("390px: Notizen anlegen, ändern, neu laden und löschen ohne horizontalen Überlauf", async ({ page, api, appErrors }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await noteLifecycle(page, api, "Mobile Notiz");
  expect(await page.getByTestId("notes-workspace").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await testInfo.attach("390px-notizen", { body: await page.screenshot(), contentType: "image/png" });
  await assertHealthy(page, appErrors);
});

test("PWA offline mit Reload: Netzwerkfehler ist sichtbar, online kommen gespeicherte Daten zurück", async ({ page, context, api, appErrors }) => {
  const id = await createNote(page, "Offline gespeicherte Notiz");
  await page.getByTestId("note-editor").fill("Bereits online gespeichert");
  await expect.poll(async () => (await getJson(api, `/notes/${id}`)).note.content).toContain("Bereits online gespeichert");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  try {
    // Wrapt cached bewusst keine privaten Arbeitsdaten oder App-Dokumente.
    // Ein Offline-Reload muss scheitern, statt eine falsche Synchronisierung vorzutäuschen.
    await expect(page.reload({ waitUntil: "domcontentloaded" })).rejects.toThrow(/ERR_INTERNET_DISCONNECTED|ERR_FAILED/);
  } finally { await context.setOffline(false); }
  await openPage(page, `/notizen?note=${id}`);
  await expect(page.getByTestId("note-editor")).toContainText("Bereits online gespeichert");
  await renameNote(page, "Wieder online");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Notiztitel" })).toHaveValue("Wieder online");
  expect(appErrors.filter((message) => !message.includes("ERR_INTERNET_DISCONNECTED") && !message.includes("ERR_FAILED")
    && !/^WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/api\/v1\/(editor|notifications)\/ws.*failed:/.test(message))).toEqual([]);
});
