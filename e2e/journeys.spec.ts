import { test, expect } from "./personas";
import { assertHealthy, noteLifecycle, openNotesSidebar, openPage, visitMainPages } from "./flows";
import { getJson } from "./server";


test("startet und lädt alle Hauptseiten ohne JavaScript-Fehler", async ({ page, appErrors, api, seededNotes }) => {
  expect((await getJson(api, "/notes")).notes).toHaveLength(seededNotes.length);
  await visitMainPages(page);
  await assertHealthy(page, appErrors);
});

test("legt eine Notiz an, ändert, lädt neu, löscht und stellt wieder her", async ({ page, api, appErrors, personaName }) => {
  await noteLifecycle(page, api, `Durchlauf ${personaName}`);
  await assertHealthy(page, appErrors);
});

test("findet Seed-Daten und zeigt eine leere Suche ohne Absturz", async ({ page, seededNotes, appErrors }) => {
  await openPage(page, "/notizen");
  await openNotesSidebar(page);
  await page.getByRole("complementary", { name: "Notizen", exact: true }).getByRole("button", { name: /Suchen/ }).click();
  const dialog = page.getByRole("dialog", { name: "Notizen durchsuchen" });
  const search = dialog.getByRole("textbox", { name: "Notizen durchsuchen" });
  await search.fill("Persona 001");
  if (seededNotes.length) await expect(dialog.getByRole("option", { name: /Persona 001/ })).toBeVisible();
  else await expect(dialog.getByRole("option")).toHaveCount(0);
  await search.fill("Keine-Treffer-abcdefgh");
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await expect(dialog.getByText(/Keine Treffer für/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await assertHealthy(page, appErrors);
});
