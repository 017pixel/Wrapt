import { expect, type Page } from "@playwright/test";
import { resourceTest as test, prepareResources, openResources, selectCron, resourceRegion,
  resourceWrites, selectArea } from "./hermes-v2-resource-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareResources(gateway));
const dialog = (page: Page) => page.getByRole("dialog").last();
const run = (page: Page) => page.getByRole("button", { name: "Cron-Job ausführen: Eigener Prüfjob", exact: true });
const remove = (page: Page) => page.getByRole("button", { name: "Cron-Job löschen: Eigener Prüfjob", exact: true });

async function fillCreate(page: Page) {
  await page.getByRole("button", { name: "Neuen Cron-Job erstellen", exact: true }).click();
  const form = dialog(page);
  await form.getByRole("textbox", { name: /Name/i }).fill("Neuer eigener Browserjob");
  await form.getByRole("textbox", { name: /Prompt/i }).fill("Eigene synthetische Anweisung");
  await form.getByRole("textbox", { name: /Zeitplan|Schedule/i }).fill("every 30m");
  await form.getByRole("combobox", { name: /Projekt/i }).selectOption("wrapt");
  await form.getByRole("checkbox", { name: /pausiert/i }).check();
  return form;
}

test("erstellt einen pausierten Job mit echter Projektkennung und ausschließlich sicheren Feldern", async ({ page, gateway }) => {
  await openResources(page);
  const form = await fillCreate(page);
  await form.getByRole("button", { name: /^Erstellen$/i }).click();
  await expect(form).toHaveCount(0);
  const writes = resourceWrites(gateway);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "POST", path: "/cron/jobs", body: {
    name: "Neuer eigener Browserjob", prompt: "Eigene synthetische Anweisung", schedule: "every 30m", projectId: "wrapt", paused: true,
  } });
  const fields = writes[0]!.body as Record<string, unknown>;
  expect(Object.keys(fields).sort()).toEqual(["name", "paused", "projectId", "prompt", "repeat", "schedule", "scope"].sort());
  await expect(page.getByRole("button", { name: "Cron-Job: Neuer eigener Browserjob", exact: true })).toBeVisible();
});

test("erhält einen abgelehnten Zeitplan samt Formularentwurf ohne automatische Wiederholung", async ({ page, gateway }) => {
  gateway.resources.rejectSchedule = true;
  await openResources(page);
  const form = await fillCreate(page);
  await form.getByRole("textbox", { name: /Zeitplan|Schedule/i }).fill("Eigener ungültiger Zeitplan");
  await form.getByRole("button", { name: /^Erstellen$/i }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByRole("textbox", { name: /Name/i })).toHaveValue("Neuer eigener Browserjob");
  await expect(form.getByRole("textbox", { name: /Zeitplan|Schedule/i })).toHaveValue("Eigener ungültiger Zeitplan");
  expect(resourceWrites(gateway)).toHaveLength(1);
  expect([...gateway.resources.jobs.values()].some((job) => job.name === "Neuer eigener Browserjob")).toBe(false);
});

test("bietet nach unklarem Create einen bewussten Katalogabgleich ohne erneute Erstellung", async ({ page, gateway }) => {
  gateway.resources.failNextAction = "unknown";
  await openResources(page);
  await selectCron(page);
  const form = await fillCreate(page);
  await form.getByRole("button", { name: /^Erstellen$/i }).click();
  await expect(form.getByRole("alert")).toContainText(/unklar/i);
  expect(resourceWrites(gateway)).toHaveLength(1);
  await form.getByRole("button", { name: /^Abbrechen$/i }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole("button", { name: "Bewusst neu lesen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cron-Job: Neuer eigener Browserjob", exact: true })).toBeVisible();
  expect(resourceWrites(gateway)).toHaveLength(1);
  expect([...gateway.resources.jobs.values()].filter((job) => job.name === "Neuer eigener Browserjob")).toHaveLength(1);
});

test("erhält native Skriptzusätze beim Bearbeiten eines Prompts", async ({ page, gateway }) => {
  const job = gateway.resources.jobs.get("own-cron")!;
  job.execution = { mode: "script", script: "own-test-script.sh", noAgent: true };
  await openResources(page); await selectCron(page);
  await expect(resourceRegion(page, "cron")).toContainText(/Skript|no_agent/);
  await page.getByRole("button", { name: "Cron-Job bearbeiten: Eigener Prüfjob", exact: true }).click();
  const form = dialog(page);
  await form.getByRole("textbox", { name: /Prompt/i }).fill("Eigener geänderter Prompt");
  await form.getByRole("button", { name: /^(Speichern|Änderungen senden)$/i }).click();
  await expect(form).toHaveCount(0);
  const writes = resourceWrites(gateway);
  expect(writes).toHaveLength(1);
  const updates = (writes[0]!.body as { updates: Record<string, unknown> }).updates;
  expect(updates).toEqual({ prompt: "Eigener geänderter Prompt" });
  for (const key of ["additional", "execution", "script", "no_agent", "workdir", "base_url"]) expect(updates).not.toHaveProperty(key);
  expect(gateway.resources.jobs.get("own-cron")!.execution).toEqual({ mode: "script", script: "own-test-script.sh", noAgent: true });
  expect(gateway.resources.jobs.get("own-cron")!.additional).toEqual([{ key: "model", value: "browser-model", truncated: false }]);
  expect(gateway.resources.jobs.get("own-cron")!.workdir).toBe("/testprojekt");
});

test("hält eine zweite Erstellung trotz vorhandener bestätigter Createquittung offen", async ({ page, gateway }) => {
  await openResources(page);
  let form = await fillCreate(page);
  await form.getByRole("button", { name: /^Erstellen$/i }).click();
  await expect(form).toHaveCount(0);
  form = await fillCreate(page);
  await form.getByRole("textbox", { name: /Name/i }).fill("Zweiter eigener neuer Job");
  await expect(form).toBeVisible();
  expect(resourceWrites(gateway)).toHaveLength(1);
  await form.getByRole("button", { name: /^Erstellen$/i }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(() => resourceWrites(gateway).length).toBe(2);
  expect([...gateway.resources.jobs.values()].map((job) => job.name)).toContain("Zweiter eigener neuer Job");
});

test("erhält den Promptentwurf bei Invalidierung ohne eine fremde Namensänderung zurückzuschreiben", async ({ page, gateway }) => {
  await openResources(page); await selectCron(page);
  await page.getByRole("button", { name: "Cron-Job bearbeiten: Eigener Prüfjob", exact: true }).click();
  const form = dialog(page);
  await form.getByRole("textbox", { name: /Prompt/i }).fill("Eigener ungesendeter Entwurf");
  gateway.resources.jobs.get("own-cron")!.name = "Nativ inzwischen geänderter Name";
  const reads = () => gateway.resources.calls.filter((call) => call.path === "/cron/jobs/own-cron").length;
  const before = reads();
  gateway.resources.invalidate();
  await expect.poll(reads).toBeGreaterThan(before);
  await expect(form.getByRole("textbox", { name: /Prompt/i })).toHaveValue("Eigener ungesendeter Entwurf");
  await form.getByRole("button", { name: /^(Speichern|Änderungen senden)$/i }).click();
  await expect(form).toHaveCount(0);
  expect(resourceWrites(gateway)).toHaveLength(1);
  expect(resourceWrites(gateway)[0]!.body).toEqual({ scope: gateway.resources.scope,
    updates: { prompt: "Eigener ungesendeter Entwurf" } });
  expect(gateway.resources.jobs.get("own-cron")!.name).toBe("Nativ inzwischen geänderter Name");
});

test("verlangt vor Run die konkrete Bestätigung und erklärt die Aktivierung eines pausierten Jobs", async ({ page, gateway }) => {
  await openResources(page); await selectCron(page);
  await run(page).click();
  const confirmation = dialog(page);
  await expect(confirmation).toContainText("own-cron");
  await expect(confirmation).toContainText(/pausiert|aktivier/i);
  expect(resourceWrites(gateway)).toHaveLength(0);
  await confirmation.getByRole("button", { name: /^Abbrechen$/i }).click();
  expect(resourceWrites(gateway)).toHaveLength(0);
  await run(page).click();
  await dialog(page).getByRole("button", { name: /^(Jetzt )?Ausführen$/i }).click();
  await expect.poll(() => resourceWrites(gateway).length).toBe(1);
  expect(resourceWrites(gateway)[0]).toMatchObject({ method: "POST", path: "/cron/jobs/own-cron/trigger", body: { confirm: true } });
  expect(gateway.resources.jobs.get("own-cron")!.paused).toBe(false);
});

test("löscht ausschließlich nach bestätigter genauer Jobauswahl", async ({ page, gateway }) => {
  await openResources(page); await selectCron(page);
  await remove(page).click();
  await expect(dialog(page)).toContainText("own-cron");
  await dialog(page).getByRole("button", { name: /^Abbrechen$/i }).click();
  expect(resourceWrites(gateway)).toHaveLength(0);
  await remove(page).click();
  await dialog(page).getByRole("button", { name: /^Löschen$/i }).click();
  await expect.poll(() => gateway.resources.jobs.has("own-cron")).toBe(false);
  expect(resourceWrites(gateway)).toHaveLength(1);
  expect(resourceWrites(gateway)[0]).toMatchObject({ method: "DELETE", path: "/cron/jobs/own-cron", body: { confirm: true } });
  expect(gateway.resources.jobs.has("other-cron")).toBe(true);
});

test("reserviert Pause synchron gegen Doppelklick und zeigt erst die native Bestätigung", async ({ page, gateway }) => {
  gateway.resources.jobs.get("own-cron")!.paused = false;
  gateway.resources.holdActions = true;
  await openResources(page); await selectCron(page);
  await page.getByRole("button", { name: "Cron-Job pausieren: Eigener Prüfjob", exact: true }).dblclick();
  await expect.poll(() => resourceWrites(gateway).length).toBe(1);
  expect(resourceWrites(gateway)[0]).toMatchObject({ path: "/cron/jobs/own-cron/pause" });
  await gateway.resources.finishActions();
  await expect(page.getByRole("button", { name: "Cron-Job fortsetzen: Eigener Prüfjob", exact: true })).toBeEnabled();
  expect(resourceWrites(gateway)).toHaveLength(1);
});

test("zeigt nativen409 ohne Runerfolg oder automatische Wiederholung", async ({ page, gateway }) => {
  gateway.resources.failNextAction = "rejected";
  await openResources(page); await selectCron(page);
  await run(page).click();
  await dialog(page).getByRole("button", { name: /^(Jetzt )?Ausführen$/i }).click();
  await expect(resourceRegion(page, "cron")).toContainText("Der eigene Prüfjob läuft bereits.");
  expect(resourceWrites(gateway)).toHaveLength(1);
  await dialog(page).getByRole("button", { name: /^Abbrechen$/i }).click();
  await selectArea(page, "Skills"); await selectArea(page, "Cron");
  expect(resourceWrites(gateway)).toHaveLength(1);
});

test("wiederholt einen unklaren Run weder bei Bereichswechsel noch bei Invalidierung", async ({ page, gateway }) => {
  gateway.resources.failNextAction = "unknown";
  await openResources(page); await selectCron(page);
  await run(page).click();
  await dialog(page).getByRole("button", { name: /^(Jetzt )?Ausführen$/i }).click();
  await expect(resourceRegion(page, "cron")).toContainText(/unklar|unbekannt/i);
  expect(resourceWrites(gateway)).toHaveLength(1);
  await dialog(page).getByRole("button", { name: /^Abbrechen$/i }).click();
  gateway.resources.invalidate();
  await selectArea(page, "Skills"); await selectArea(page, "Cron");
  await expect(page.getByRole("button", { name: "Cron-Job: Eigener Prüfjob", exact: true })).toBeVisible();
  expect(resourceWrites(gateway)).toHaveLength(1);
});

test("erhält die bestätigte Runquittung wenn ein OneShot anschließend fehlt", async ({ page, gateway }) => {
  gateway.resources.oneShotDisappears = true;
  gateway.resources.jobs.get("own-cron")!.repeat = "once";
  await openResources(page); await selectCron(page);
  await run(page).click();
  await dialog(page).getByRole("button", { name: /^(Jetzt )?Ausführen$/i }).click();
  await expect.poll(() => gateway.resources.jobs.has("own-cron")).toBe(false);
  await expect(resourceRegion(page, "cron").getByText(/Dieser Job existiert nativ nicht mehr/)).toBeVisible();
  await expect(resourceRegion(page, "cron").getByRole("list", { name: "Cron-Aktionen", exact: true }))
    .toContainText("Ausführen: bestätigt mit nativer Quittung");
  expect(resourceWrites(gateway)).toHaveLength(1);
  expect(resourceWrites(gateway)[0]!.path).toBe("/cron/jobs/own-cron/trigger");
});
