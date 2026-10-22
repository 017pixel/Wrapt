import { expect } from "@playwright/test";
import { requestTest as test, sessionId, requestCard as card, requestCalls as calls,
  openRequestChat as open } from "./hermes-v2-request-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
const questions = [
  { id: "farbe", text: "Welche Farbe?", choices: ["Dunkel", "Hell"], multiple: false },
  { id: "bereiche", text: "Welche Bereiche?", choices: ["API", "Web"], multiple: true },
  { id: "notiz", text: "Welche Notiz?", choices: [], multiple: false },
];

test("sendet Single-, Multi- und Freitextantwort im echten Stringvertrag", async ({ page, gateway }) => {
  const request = gateway.requests.open(sessionId, { kind: "clarify", method: "clarify", questions, lockedAnswers: {} });
  await open(page);
  const current = card(page, request);
  const single = current.getByRole("group", { name: "Welche Farbe?", exact: true });
  await single.getByRole("radio", { name: "Dunkel", exact: true }).check();
  await single.getByRole("textbox", { name: "Freitext", exact: true }).fill("Eigene Farbe");
  await expect(single.getByRole("radio", { name: "Dunkel", exact: true })).not.toBeChecked();
  await single.getByRole("radio", { name: "Dunkel", exact: true }).check();
  await expect(single.getByRole("textbox", { name: "Freitext", exact: true })).toHaveValue("");
  const multi = current.getByRole("group", { name: "Welche Bereiche?", exact: true });
  await multi.getByRole("checkbox", { name: "API", exact: true }).check();
  await multi.getByRole("checkbox", { name: "Web", exact: true }).check();
  await multi.getByRole("textbox", { name: "Freitext", exact: true }).fill("Dokumentation");
  await current.getByRole("group", { name: "Welche Notiz?", exact: true }).getByRole("textbox").fill("Eigene Notiz");
  await current.getByRole("button", { name: "Antworten senden", exact: true }).click();
  await expect(current).toHaveCount(0);
  expect(gateway.requests.observations).toEqual([{ key: request.key, kind: "clarify", answers: {
    farbe: "Dunkel", bereiche: JSON.stringify(["API", "Web", "Dokumentation"]), notiz: "Eigene Notiz",
  } }]);
  expect(calls(gateway)).toHaveLength(1);
});

test("bestätigt frühe Locks, erhält andere Entwürfe und schließt mit dem letzten Lock", async ({ page, gateway }) => {
  const request = gateway.requests.open(sessionId, { kind: "clarify", method: "clarify", questions: [questions[0]!, questions[2]!], lockedAnswers: {} });
  await open(page);
  const current = card(page, request);
  const first = current.locator(".hermesv2-question-wrap").filter({ hasText: "Welche Farbe?" });
  const last = current.locator(".hermesv2-question-wrap").filter({ hasText: "Welche Notiz?" });
  await last.getByRole("textbox").fill("Entwurf bleibt erhalten");
  await first.getByRole("radio", { name: "Dunkel", exact: true }).check();
  await first.getByRole("button", { name: "Antwort sichern", exact: true }).click();
  await expect(first).toContainText("Gesicherte Antwort: Dunkel");
  await expect(last.getByRole("textbox")).toHaveValue("Entwurf bleibt erhalten");
  await last.getByRole("button", { name: "Antwort sichern", exact: true }).click();
  await expect(current).toHaveCount(0);
  expect(calls(gateway, "request.lock")).toHaveLength(2);
  expect(calls(gateway)).toHaveLength(0);
  expect(gateway.requests.observations).toEqual([
    { key: request.key, kind: "lock", questionId: "farbe", answer: "Dunkel" },
    { key: request.key, kind: "lock", questionId: "notiz", answer: "Entwurf bleibt erhalten" },
  ]);
});

test("überträgt Überspringen als null und beendet die Rückfrage per Abbrechen", async ({ page, gateway }) => {
  const request = gateway.requests.open(sessionId, { kind: "clarify", method: "clarify", questions: questions.slice(0, 2), lockedAnswers: {} });
  await open(page);
  const current = card(page, request);
  const first = current.locator(".hermesv2-question-wrap").filter({ hasText: "Welche Farbe?" });
  await first.getByRole("button", { name: "Überspringen", exact: true }).click();
  await expect(first).toContainText("Übersprungen");
  await current.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(current).toHaveCount(0);
  expect(gateway.requests.observations).toEqual([
    { key: request.key, kind: "lock", questionId: "farbe", answer: null },
    { key: request.key, kind: "cancel" },
  ]);
});

test("stellt bestätigte Antworten nach Reconnect wieder her und bewahrt übrigen Freitext", async ({ page, gateway }) => {
  const lockedAnswers = { farbe: null, bereiche: JSON.stringify(["API", "Web"]) };
  const request = gateway.requests.open(sessionId, { kind: "clarify", method: "clarify", questions, lockedAnswers });
  await open(page);
  const current = card(page, request);
  await expect(current.getByText("Übersprungen", { exact: true })).toBeVisible();
  await expect(current.getByText("Gesicherte Antwort: API, Web", { exact: true })).toBeVisible();
  await expect(current.getByRole("radio")).toHaveCount(0);
  await expect(current.getByRole("checkbox")).toHaveCount(0);
  await current.getByRole("textbox").fill("Normaler Entwurf");
  await gateway.disconnect();
  await expect.poll(() => calls(gateway, "session.subscribe").length).toBeGreaterThanOrEqual(2);
  await expect(current.getByRole("textbox")).toHaveValue("Normaler Entwurf");
  await current.getByRole("button", { name: "Antworten senden", exact: true }).click();
  await expect(current).toHaveCount(0);
  expect(gateway.requests.observations[0]?.answers).toEqual({ ...lockedAnswers, notiz: "Normaler Entwurf" });
});

for (const multiple of [false, true]) {
  test(`beantwortet Setup mit ${multiple ? "mehreren echten IDs" : "einer echten ID"}`, async ({ page, gateway }) => {
    const request = gateway.requests.open(sessionId, { kind: "setup", method: "setup_choose", question: "Welche Werkzeuge?", multiple,
      options: [{ id: "terminal", label: "Terminal" }, { id: "dateien", label: "Dateien" }] });
    await open(page);
    const current = card(page, request);
    await current.getByRole(multiple ? "checkbox" : "radio", { name: "Terminal", exact: true }).check();
    if (multiple) await current.getByRole("checkbox", { name: "Dateien", exact: true }).check();
    await current.getByRole("button", { name: "Auswählen", exact: true }).click();
    await expect(current).toHaveCount(0);
    expect(gateway.requests.observations).toEqual([{ key: request.key, kind: "setup", picked: multiple ? ["terminal", "dateien"] : "terminal" }]);
  });
}

test("bricht Setup mit picked:null ab", async ({ page, gateway }) => {
  const request = gateway.requests.open(sessionId, { kind: "setup", method: "setup_choose", question: "Einrichtung wählen", multiple: false,
    options: [{ id: "terminal", label: "Terminal" }] });
  await open(page);
  await card(page, request).getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(card(page, request)).toHaveCount(0);
  expect(gateway.requests.observations).toEqual([{ key: request.key, kind: "setup", picked: null }]);
});

test("sendet Vaultlogin als flüchtiges JSON und leert beide DOMfelder vor der Antwort", async ({ page, gateway }) => {
  gateway.requests.hold = true;
  gateway.requests.inspectSecret = (value) => {
    const login = JSON.parse(value) as Record<string, unknown>;
    return login.identifier === "dummy@example.test" && login.password === "Nur-ein-Testpasswort";
  };
  const request = gateway.requests.open(sessionId, { kind: "secret", method: "vault.save_login", label: "Testlogin speichern", hint: "" });
  await open(page);
  const current = card(page, request);
  await current.getByLabel("Kennung", { exact: true }).fill("dummy@example.test");
  await current.getByLabel("Passwort", { exact: true }).fill("Nur-ein-Testpasswort");
  await current.getByLabel("Passwort", { exact: true }).press("Enter");
  await expect(current.getByLabel("Kennung", { exact: true })).toHaveValue("");
  await expect(current.getByLabel("Passwort", { exact: true })).toHaveValue("");
  expect(gateway.requests.observations[0]?.secret).toMatchObject({ identifierLength: 18, passwordLength: 20, matched: true });
  gateway.requests.finishPending();
  await expect(current).toHaveCount(0);
});

test("überspringt Vaultlogin mit exakt leerem Wirewert", async ({ page, gateway }) => {
  gateway.requests.inspectSecret = (value) => value === "";
  const request = gateway.requests.open(sessionId, { kind: "secret", method: "vault.save_login", label: "Testlogin überspringen", hint: "" });
  await open(page);
  await card(page, request).getByRole("button", { name: "Überspringen", exact: true }).click();
  await expect(card(page, request)).toHaveCount(0);
  expect(gateway.requests.observations[0]?.secret).toMatchObject({ length: 0, matched: true });
});

for (const height of [844, 500]) test(`hält bei vielen mobilen Rückfragen Composer und Stop bei ${height}px erreichbar`, async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height });
  const story = gateway.stories.get(sessionId)!;
  story.turnId = "browser-request-turn";
  const snapshot = story.snapshot;
  snapshot.running = snapshot.session.running = true;
  snapshot.turnStartedAt = Date.now();
  for (let index = 0; index < 3; index++) gateway.requests.open(sessionId, { kind: "clarify", method: "clarify", lockedAnswers: {},
    questions: Array.from({ length: 5 }, (_, question) => ({ id: `frage-${index}-${question}`,
      text: `Rückfrage ${index + 1}.${question + 1}`, choices: ["Prüfen", "Später"], multiple: false })) });
  await open(page);
  const deck = page.getByRole("region", { name: "Offene Anfragen von Hermes", exact: true });
  const deckBox = await deck.boundingBox();
  expect(deckBox?.height ?? 1000).toBeLessThan(height * .65);
  const composer = page.getByRole("textbox", { name: "Nachricht an Hermes" });
  await expect(composer).toBeVisible();
  expect((await composer.boundingBox())!.height).toBeLessThanOrEqual(64);
  expect(await composer.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  const stop = page.getByRole("button", { name: "Stoppen", exact: true });
  await expect(stop).toBeVisible();
  const box = await stop.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await stop.click();
  expect(calls(gateway, "session.stop")).toHaveLength(1);
});
