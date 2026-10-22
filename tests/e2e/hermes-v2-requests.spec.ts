import { expect } from "@playwright/test";
import { requestTest as test, sessionId, otherId, requestCard as card, requestCalls as calls,
  openRequestChat as open, openApproval as approval, openSecret as secret } from "./hermes-v2-request-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });

for (const choice of ["once", "deny"] as const) {
  test(`beantwortet die angebotene Freigabe ${choice} nativ und genau einmal`, async ({ page, gateway }) => {
    const request = approval(gateway);
    await open(page);
    const current = card(page, request);
    await expect(current).toContainText("echo eigener-browser-test");
    await expect(current.getByRole("button", { name: "Für Sitzung erlauben", exact: true })).toHaveCount(0);
    await expect(current.getByRole("button", { name: "Dauerhaft erlauben", exact: true })).toHaveCount(0);
    await current.getByRole("button", { name: choice === "once" ? "Einmal erlauben" : "Ablehnen", exact: true }).click();
    await expect(current).toHaveCount(0);
    expect(gateway.requests.observations).toEqual([{ key: request.key, kind: "approval", choice }]);
    expect(calls(gateway)).toHaveLength(1);
    expect(calls(gateway, "message.submit")).toHaveLength(0);
  });
}

test("sperrt einen Doppelklick während der ausstehenden Freigabe", async ({ page, gateway }) => {
  gateway.requests.hold = true;
  const request = approval(gateway);
  await open(page);
  const allow = card(page, request).getByRole("button", { name: "Einmal erlauben", exact: true });
  await allow.dblclick();
  await expect(allow).toBeDisabled();
  expect(calls(gateway)).toHaveLength(1);
  gateway.requests.finishPending();
  await expect(card(page, request)).toHaveCount(0);
});

test("stellt eine offene Freigabe nach Reconnect ohne Antwortwiederholung wieder her", async ({ page, gateway }) => {
  const request = approval(gateway);
  await open(page);
  await expect(card(page, request)).toBeVisible();
  await gateway.disconnect();
  await expect.poll(() => calls(gateway, "session.subscribe").length).toBeGreaterThanOrEqual(2);
  await expect(card(page, request).getByRole("button", { name: "Einmal erlauben", exact: true })).toBeEnabled();
  expect(calls(gateway)).toHaveLength(0);
  await card(page, request).getByRole("button", { name: "Ablehnen", exact: true }).click();
  await expect(card(page, request)).toHaveCount(0);
  expect(calls(gateway)).toHaveLength(1);
});

test("sperrt nach Sendbestätigung bis zum tatsächlichen Anfrageabschluss weiter", async ({ page, gateway }) => {
  gateway.requests.keepOpenAfterReply = true;
  const request = approval(gateway);
  await open(page);
  const allow = card(page, request).getByRole("button", { name: "Einmal erlauben", exact: true });
  await allow.click();
  await expect.poll(() => calls(gateway, "session.subscribe").length).toBeGreaterThanOrEqual(2);
  await expect(allow).toBeDisabled();
  expect(calls(gateway)).toHaveLength(1);
  gateway.requests.cancel(sessionId, request.key, "responded");
  await expect(card(page, request)).toHaveCount(0);
});

test("schließt dieselbe Anfrage in beiden Browserflächen nach einer Antwort", async ({ page, context, gateway }) => {
  const request = approval(gateway);
  await open(page);
  const other = await context.newPage();
  await open(other);
  await expect(card(other, request)).toBeVisible();
  await card(page, request).getByRole("button", { name: "Einmal erlauben", exact: true }).click();
  await expect(card(page, request)).toHaveCount(0);
  await expect(card(other, request)).toHaveCount(0);
  expect(calls(gateway)).toHaveLength(1);
  await other.close();
});

test("lässt zwei konkurrierende Tabs nur eine Freigabe ausführen", async ({ page, context, gateway }) => {
  gateway.requests.hold = true;
  const request = approval(gateway);
  await open(page);
  const other = await context.newPage();
  await open(other);
  await card(page, request).getByRole("button", { name: "Einmal erlauben", exact: true }).click();
  await card(other, request).getByRole("button", { name: "Einmal erlauben", exact: true }).click();
  await expect(other.getByRole("alert").filter({ hasText: /andere.*antwortet|bereits.*beantwortet/i }).first()).toBeVisible();
  expect(calls(gateway)).toHaveLength(2);
  expect(gateway.requests.observations).toHaveLength(1);
  gateway.requests.finishPending();
  await expect(card(other, request)).toHaveCount(0);
  await other.close();
});

for (const method of ["sudo", "secret", "vault.code", "vault.unlock_prompt"] as const)
test(`leert ${method} sofort vor der noch ausstehenden Antwort`, async ({ page, gateway }) => {
  gateway.requests.hold = true;
  gateway.requests.inspectSecret = (value) => value === "Nur-fuer-den-Browsertest";
  const request = secret(gateway, method);
  await open(page);
  const current = card(page, request);
  const input = current.locator('input[type="password"]');
  await expect(input).toHaveCount(1);
  await input.fill("Nur-fuer-den-Browsertest");
  await current.locator('button[type="submit"]').click();
  await expect(input).toHaveValue("");
  expect(calls(gateway)).toHaveLength(1);
  expect(gateway.requests.observations[0]?.secret).toMatchObject({ matched: true });
  const persisted = await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]);
  expect(persisted.join(" ").includes("Nur-fuer-den-Browsertest")).toBe(false);
  await expect(page.getByRole("textbox", { name: "Nachricht an Hermes" })).toHaveValue("");
  gateway.requests.finishPending();
  await expect(current).toHaveCount(0);
});

test("leert auch den alten DOM-Knoten beim Sitzungswechsel", async ({ page, gateway }) => {
  const request = secret(gateway);
  await open(page);
  const input = card(page, request).locator('input[type="password"]');
  await input.fill("Alter-synthetischer-Wert");
  await input.evaluate((element) => {
    (window as Window & { __hermesOldSecret?: HTMLInputElement }).__hermesOldSecret = element as HTMLInputElement;
  });
  await page.locator(`[data-session-id="${otherId}"] .hermesv2-rowselect`).click();
  await expect(page).toHaveURL(new RegExp(`session=${otherId}`));
  expect(await page.evaluate(() => (window as Window & { __hermesOldSecret?: HTMLInputElement }).__hermesOldSecret?.value)).toBe("");
  await page.locator(`[data-session-id="${sessionId}"] .hermesv2-rowselect`).click();
  await expect(card(page, request).locator('input[type="password"]')).toHaveValue("");
  expect(calls(gateway)).toHaveLength(0);
  await page.evaluate(() => { delete (window as Window & { __hermesOldSecret?: HTMLInputElement }).__hermesOldSecret; });
});

test("behält bei unbekanntem Secret-Ausgang weder Eingabe noch automatische Wiederholung", async ({ page, gateway }) => {
  gateway.requests.loseNextReply = true;
  const request = secret(gateway);
  await open(page);
  const current = card(page, request);
  const input = current.locator('input[type="password"]');
  await input.fill("Synthetischer-verlorener-Testwert");
  await current.locator('button[type="submit"]').click();
  await expect.poll(() => calls(gateway, "session.subscribe").length).toBeGreaterThanOrEqual(2);
  await expect(input).toHaveValue("");
  await expect(current.locator('button[type="submit"]')).toBeDisabled();
  expect(calls(gateway)).toHaveLength(1);
  await page.reload();
  await expect(card(page, request).locator('input[type="password"]')).toHaveValue("");
  expect(calls(gateway)).toHaveLength(1);
  expect(gateway.requests.observations).toHaveLength(1);
});

test("entfernt einen abgebrochenen Secretrequest ohne Antwort oder Wiederherstellung", async ({ page, gateway }) => {
  const request = secret(gateway);
  await open(page);
  const input = card(page, request).locator('input[type="password"]');
  await input.fill("Nicht-gesendeter-Testwert");
  gateway.requests.cancel(sessionId, request.key);
  await expect(card(page, request)).toHaveCount(0);
  await page.reload();
  await expect(card(page, request)).toHaveCount(0);
  expect(calls(gateway)).toHaveLength(0);
});

test("leert geheime Eingaben hinter dem tatsächlich geöffneten mobilen Drawer", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const request = secret(gateway);
  await open(page);
  const input = card(page, request).locator('input[type="password"]');
  await input.fill("Nur-ein-verdeckter-Dummywert");
  await page.getByRole("button", { name: "Sitzungen", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeDisabled();
  await page.getByRole("button", { name: "Sitzungsspalte schließen", exact: true }).click();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("");
  expect(calls(gateway)).toHaveLength(0);
});

test("weist einen veralteten Antwortversuch sichtbar und ohne Wiederholung ab", async ({ page, gateway }) => {
  gateway.requests.rejectNextAsStale = true;
  const request = approval(gateway);
  await open(page);
  await card(page, request).getByRole("button", { name: "Einmal erlauben", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Diese Anfrage ist nicht mehr aktuell." })).toBeVisible();
  expect(calls(gateway)).toHaveLength(1);
  expect(gateway.requests.observations).toHaveLength(0);
  gateway.requests.cancel(sessionId, request.key);
  await expect(card(page, request)).toHaveCount(0);
  expect(calls(gateway)).toHaveLength(1);
});
