import { expect } from "@playwright/test";
import { composerTest as test, prepareComposer, openComposer as open, modelPicker, composerInput as input,
  mutationCalls as calls, sessionId, otherId } from "./hermes-v2-composer-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareComposer(gateway));

test("hält die ausstehende Modellwahl offen und verhindert doppelte Mutationen", async ({ page, gateway }) => {
  gateway.composer.hold = true;
  await open(page);
  const dialog = await modelPicker(page);
  const option = dialog.locator('[data-provider-id="premium"][data-model-id="costly-model"]');
  await option.click();
  await expect.poll(() => calls(gateway, "model.select").length).toBe(1);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/in Klärung|Auswahl läuft/i).first()).toBeVisible();
  if (await option.isEnabled()) await option.click();
  expect(calls(gateway, "model.select")).toHaveLength(1);
  gateway.composer.finishPending();
  await expect(dialog.getByText("Dieses Testmodell verursacht höhere Kosten. Wechsel bestätigen?", { exact: true })).toBeVisible();
});

test("stoppt einen bereits laufenden Turn trotz noch ausstehender Sendeantwort", async ({ page, gateway }) => {
  gateway.holdSubmitResults = true;
  gateway.autoComplete = false;
  await open(page);
  await input(page).fill("Eigener Test mit gehaltener Sendeantwort");
  await input(page).press("Enter");
  await expect.poll(() => calls(gateway, "message.submit").length).toBe(1);
  await expect(page.getByRole("button", { name: "Senden…", exact: true })).toBeDisabled();
  const stop = page.getByRole("button", { name: "Stoppen", exact: true });
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect.poll(() => calls(gateway, "session.stop").length).toBe(1);
  await expect(stop).toHaveCount(0);
  gateway.finishSubmitResults();
  await expect(input(page)).toHaveValue("");
  expect(calls(gateway, "message.submit")).toHaveLength(1);
});

test("zeigt einen nur vorgemerkten Titel ohne eine gespeicherte Umbenennung zu behaupten", async ({ page, gateway }) => {
  gateway.composer.titlePending = true;
  await open(page);
  const initialTitle = gateway.stories.get(sessionId)!.snapshot.session.title;
  const sessionRow = page.locator(`[data-session-id="${sessionId}"] .hermesv2-rowline`);
  await sessionRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Sitzung umbenennen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Sitzung umbenennen", exact: true });
  await dialog.getByRole("textbox", { name: "Sitzungstitel", exact: true }).fill("Noch unbestätigter Titel");
  await dialog.getByRole("button", { name: "Umbenennen", exact: true }).click();
  await expect.poll(() => calls(gateway, "session.title").length).toBe(1);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/unbestätigt|vorgemerkt/i).first()).toBeVisible();
  expect(gateway.stories.get(sessionId)!.snapshot.session.title).toBe(initialTitle);
});

test("leert ein Secretfeld beim Öffnen des lokalen Modelldialogs", async ({ page, gateway }) => {
  gateway.requests.open(sessionId, { kind: "secret", method: "secret", label: "Testschlüssel",
    hint: "Nur synthetische Eingabe" });
  await open(page);
  const field = page.locator('.hermesv2-secret-form input[type="password"]');
  await expect(field).toHaveCount(1);
  await field.fill("synthetischer-testwert");
  await modelPicker(page);
  await expect(field).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(field).toHaveValue("");
  expect(calls(gateway, "request.respond")).toHaveLength(0);
});

test("öffnet über den Resumecommand die bestehende Sitzungsauswahl", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await open(page);
  await input(page).fill("/resume");
  await input(page).press("Enter");
  const drawer = page.getByRole("dialog", { name: "Hermes-V2-Sitzungen", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-session-id="' + otherId + '"]')).toBeVisible();
  expect(calls(gateway, "message.submit")).toHaveLength(0);
});

test("lässt die Denktiefe bei geringer mobiler Höhe tatsächlich anklicken", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await open(page);
  const trigger = page.getByRole("button", { name: "Denktiefe", exact: true });
  await trigger.click();
  const levels = page.getByRole("listbox", { name: "Denktiefe wählen", exact: true });
  const high = levels.getByRole("option", { name: "Hoch", exact: true });
  await high.scrollIntoViewIfNeeded();
  await expect.poll(() => high.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && element.contains(hit);
  })).toBe(true);
  await high.click();
  await expect(levels).toHaveCount(0);
  await expect(trigger).toContainText("Hoch");
  expect(gateway.composer.observations).toContainEqual({ op: "reasoning.select", sessionId, effort: "high" });
  const box = await input(page).boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(500);
});

test("beantwortet eine Rückfrage neben längerem Verlauf auf einem kurzen Handybildschirm", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  gateway.seedHistory(sessionId, 30);
  const story = gateway.stories.get(sessionId)!;
  story.turnId = "request-and-history-layout";
  story.snapshot.running = story.snapshot.session.running = true;
  story.snapshot.turnStartedAt = Date.now();
  gateway.requests.open(sessionId, { kind: "clarify", method: "clarify", lockedAnswers: {},
    questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, text: `Frage ${index + 1}`,
      choices: ["Prüfen", "Später"], multiple: false })) });
  await open(page);
  const list = page.locator(".hermesv2-request-deck-list");
  expect((await list.boundingBox())!.height).toBeGreaterThanOrEqual(88);
  const question = page.getByRole("group", { name: "Frage 1", exact: true });
  await question.getByRole("radio", { name: "Prüfen", exact: true }).check();
  await page.locator(".hermesv2-question-wrap").first().getByRole("button", { name: "Antwort sichern", exact: true }).click();
  await expect.poll(() => calls(gateway, "request.lock").length).toBe(1);
  await expect(page.getByText("Gesicherte Antwort: Prüfen", { exact: true })).toBeVisible();
  const box = await page.getByRole("button", { name: "Stoppen", exact: true }).boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(500);
});

