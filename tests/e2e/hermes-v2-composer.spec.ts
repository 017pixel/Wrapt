import { expect } from "@playwright/test";
import { composerTest as test, prepareComposer, openComposer as open, modelPicker, composerInput as input,
  mutationCalls as calls, sessionId, otherId } from "./hermes-v2-composer-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareComposer(gateway));

test("wählt ein echtes provider:model aus dem dynamischen Katalog", async ({ page, gateway }) => {
  await open(page);
  const dialog = await modelPicker(page);
  await dialog.getByRole("searchbox", { name: "Modelle suchen", exact: true }).fill("Schnelles");
  const model = dialog.locator('[data-provider-id="fast"][data-model-id="fast-model"]');
  await expect(model).toBeVisible();
  await expect(dialog.locator('[data-model-id="browser-model"]')).toHaveCount(0);
  await model.click();
  await expect(dialog.getByText("Aktuell: fast:fast-model", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modell wählen", exact: true })).toContainText(/fast-model|Schnelles/);
  expect(gateway.composer.observations).toContainEqual(expect.objectContaining({ op: "model.select", provider: "fast", model: "fast-model", confirmed: false }));
  expect(calls(gateway, "message.submit")).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Modell wählen", exact: true })).toContainText(/fast-model|Schnelles/);
});

test("zeigt nicht verfügbare Provider ohne auswählbares Modell", async ({ page }) => {
  await open(page);
  const dialog = await modelPicker(page);
  const unavailable = dialog.locator('[data-provider-id="unavailable"][data-model-id="unavailable-model"]');
  if (await unavailable.count()) await expect(unavailable).toBeDisabled();
  await dialog.getByRole("searchbox", { name: "Modelle suchen", exact: true }).fill("Kein solches Modell");
  await expect(dialog.locator("[data-model-id]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modell wählen", exact: true })).toBeFocused();
});

test("fordert die konkrete Core-Kostenbestätigung vor dem Wechsel an", async ({ page, gateway }) => {
  await open(page);
  const dialog = await modelPicker(page);
  await dialog.locator('[data-provider-id="premium"][data-model-id="costly-model"]').click();
  await expect(page.getByText("Dieses Testmodell verursacht höhere Kosten. Wechsel bestätigen?", { exact: true })).toBeVisible();
  expect(gateway.stories.get(sessionId)!.snapshot.selection?.provider).toBe("test");
  expect(calls(gateway, "model.select")).toHaveLength(1);
  await page.getByRole("button", { name: /Wechsel bestätigen|Modellwechsel bestätigen|Kosten bestätigen|Bestätigen/, exact: false }).click();
  await expect(dialog.getByText("Aktuell: premium:costly-model", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modell wählen", exact: true })).toContainText(/costly-model|Kostenpflichtiges/);
  expect(gateway.composer.observations.filter((row) => row.op === "model.select").map((row) => row.confirmed)).toEqual([false, true]);
});

test("verwirft eine offene Modellbestätigung beim Sitzungswechsel", async ({ page, gateway }) => {
  await open(page);
  await page.locator(`[data-session-id="${otherId}"] .hermesv2-rowselect`).click();
  await expect(page).toHaveURL(new RegExp(`session=${otherId}`));
  await page.locator(`[data-session-id="${sessionId}"] .hermesv2-rowselect`).click();
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}`));
  const dialog = await modelPicker(page);
  await dialog.locator('[data-provider-id="premium"][data-model-id="costly-model"]').click();
  await expect(page.getByText("Dieses Testmodell verursacht höhere Kosten. Wechsel bestätigen?", { exact: true })).toBeVisible();
  // ModalFrame legt einen eigenen Historyeintrag an. Direkt zur vorherigen
  // Sitzung springen, während der Bestätigungsdialog noch geöffnet ist.
  await page.evaluate(() => window.history.go(-2));
  await expect(page).toHaveURL(new RegExp(`session=${otherId}`));
  await expect(page.getByText("Dieses Testmodell verursacht höhere Kosten. Wechsel bestätigen?", { exact: true })).toHaveCount(0);
  expect(calls(gateway, "model.select")).toHaveLength(1);
});

test("kennzeichnet einen vorgemerkten Modellwechsel ohne das laufende Modell zu ersetzen", async ({ page, gateway }) => {
  gateway.composer.deferModelSelection = true;
  await open(page);
  const dialog = await modelPicker(page);
  await dialog.locator('[data-provider-id="fast"][data-model-id="fast-model"]').click();
  await expect(page.getByText(/vorgemerkt|nach.*Turn/i).first()).toBeVisible();
  expect(gateway.stories.get(sessionId)!.snapshot.selection).toEqual({ provider: "test", model: "browser-model" });
  expect(calls(gateway, "model.select")).toHaveLength(1);
});

test("nutzt dynamische Skillcommands als erkennbare Anweisung ohne automatisches Senden", async ({ page, gateway }) => {
  gateway.composer.commands = gateway.composer.commands.map((command) => command.kind === "skill"
    ? { ...command, key: "/neu_geladener_skill", label: "/neu_geladener_skill", description: "Dynamisch vom Testkatalog" } : command);
  await open(page);
  await input(page).fill("/neu_geladener_skill Prüfe diese Änderung");
  const palette = page.getByRole("listbox", { name: "Hermes-Befehle", exact: true });
  await expect(palette.getByRole("option").filter({ hasText: "/neu_geladener_skill" })).toBeVisible();
  await input(page).press("Enter");
  await expect(input(page)).toHaveValue(/Verwende den Hermes-Skill.*neu_geladener_skill.*für diese Aufgabe:[\s\S]*Prüfe diese Änderung/);
  expect(calls(gateway, "message.submit")).toHaveLength(0);
  await input(page).press("Enter");
  await expect.poll(() => calls(gateway, "message.submit").length).toBe(1);
});

test("öffnet die Modellfläche über den echten Commandalias ohne Textsubmit", async ({ page, gateway }) => {
  await open(page);
  await input(page).fill("/m");
  await input(page).press("Enter");
  await expect(page.getByRole("dialog", { name: "Modell und Anbieter", exact: true })).toBeVisible();
  expect(calls(gateway, "message.submit")).toHaveLength(0);
});

test("löst einen Fuzzytreffer über dessen tatsächlichen kanonischen Command auf", async ({ page, gateway }) => {
  await open(page);
  await input(page).fill("/mdl");
  await expect(page.getByRole("listbox", { name: "Hermes-Befehle", exact: true })
    .getByRole("option").filter({ hasText: "/model" })).toBeVisible();
  await input(page).press("Enter");
  await expect(page.getByRole("dialog", { name: "Modell und Anbieter", exact: true })).toBeVisible();
  expect(calls(gateway, "message.submit")).toHaveLength(0);
});

test("hält den Composerfokus bei Pfeiltasten und unterdrückt IME-Enter in der Palette", async ({ page, gateway }) => {
  await open(page);
  await input(page).fill("/");
  const palette = page.getByRole("listbox", { name: "Hermes-Befehle", exact: true });
  await expect(palette.getByRole("option").first()).toBeVisible();
  await input(page).press("ArrowDown");
  await expect(palette.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveAttribute("aria-activedescendant", await palette.getByRole("option").nth(1).getAttribute("id") ?? "");
  await input(page).evaluate((node) => {
    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true }));
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  await expect(palette).toBeVisible();
  expect(calls(gateway, "message.submit")).toHaveLength(0);
  expect(calls(gateway, "session.create")).toHaveLength(0);
  await input(page).press("Escape");
  await expect(palette).toHaveCount(0);
});

test("sendet einen nicht verfügbaren Slashbefehl weder per Enter noch über Senden", async ({ page, gateway }) => {
  await open(page);
  await input(page).fill("/update jetzt");
  const option = page.getByRole("option").filter({ hasText: "/update" });
  await expect(option).toHaveAttribute("aria-disabled", "true");
  await input(page).press("Enter");
  await expect(page.getByRole("button", { name: "Senden", exact: true })).toBeDisabled();
  expect(calls(gateway, "message.submit")).toHaveLength(0);
  await input(page).press("Escape");
  await expect(page.getByRole("listbox", { name: "Hermes-Befehle", exact: true })).toHaveCount(0);
  await input(page).press("Enter");
  expect(calls(gateway, "message.submit")).toHaveLength(0);
});

test("benennt eine Sitzung über den nativen Vertrag um und erhält den Titel nach Reload", async ({ page, gateway }) => {
  await open(page);
  await page.getByRole("button", { name: "Sitzung umbenennen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Sitzung umbenennen", exact: true });
  await dialog.getByRole("textbox", { name: "Sitzungstitel", exact: true }).fill("Nativ umbenannt");
  await dialog.getByRole("button", { name: "Umbenennen", exact: true }).click();
  await expect(page.locator(`[data-session-id="${sessionId}"]`)).toContainText("Nativ umbenannt");
  expect(calls(gateway, "session.title")).toHaveLength(1);
  if (await dialog.isVisible()) await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sitzung umbenennen", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Sitzungstitel", exact: true })).toHaveValue("Nativ umbenannt");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(`[data-session-id="${sessionId}"]`)).toContainText("Nativ umbenannt");
});

test("ändert die Denktiefe über Tastatur und bietet Aus nur beim belegten Modell an", async ({ page, gateway }) => {
  await open(page);
  const trigger = page.getByRole("button", { name: "Denktiefe", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const levels = page.getByRole("listbox", { name: "Denktiefe wählen", exact: true });
  await expect(levels).toBeVisible();
  await expect(levels.getByRole("option", { name: "Aus", exact: true })).toHaveCount(0);
  await levels.getByRole("option", { name: "Hoch", exact: true }).press("Enter");
  await expect(trigger).toContainText("Hoch");
  expect(gateway.composer.observations).toContainEqual({ op: "reasoning.select", sessionId, effort: "high" });
  const dialog = await modelPicker(page);
  await dialog.locator('[data-provider-id="fast"][data-model-id="fast-model"]').click();
  await expect(dialog.getByText("Aktuell: fast:fast-model", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await expect(levels.getByRole("option", { name: "Aus", exact: true })).toHaveCount(1);
});

test("zeigt eine unbestätigte Denktiefe als Wunsch und erhält den beobachteten Wert", async ({ page, gateway }) => {
  gateway.composer.unconfirmedReasoning = true;
  await open(page);
  await page.getByRole("button", { name: "Denktiefe", exact: true }).click();
  await page.getByRole("listbox", { name: "Denktiefe wählen", exact: true }).getByRole("option", { name: "Hoch", exact: true }).click();
  await expect(page.getByText(/unbestätigt/i).first()).toBeVisible();
  expect(gateway.stories.get(sessionId)!.snapshot.composer?.reasoning).toEqual({ effort: "medium", wire: "medium" });
  expect(calls(gateway, "reasoning.select")).toHaveLength(1);
});

test("sperrt Denktiefe während eines tatsächlich laufenden Turns und zeigt Freigaben nur lesbar", async ({ page, gateway }) => {
  const story = gateway.stories.get(sessionId)!;
  story.turnId = "composer-running-test";
  story.snapshot.running = story.snapshot.session.running = true;
  story.snapshot.turnStartedAt = Date.now();
  await open(page);
  await expect(page.getByRole("button", { name: "Denktiefe", exact: true })).toBeDisabled();
  await expect(page.getByText(/Freigaben.*global/i)).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Freigaben|Approval/i })).toHaveCount(0);
  expect(calls(gateway, "reasoning.select")).toHaveLength(0);
});

test("erhält native Anfragen und Composer bei mobiler Modellwahl", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  gateway.requests.open(sessionId, { kind: "approval", method: "approval", command: "echo test", description: "Browsertest", choices: ["once", "deny"] });
  await open(page);
  const dialog = await modelPicker(page);
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article", { name: "Freigabe angefragt", exact: true })).toBeVisible();
  const box = await input(page).boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
