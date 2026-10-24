import { expect, test as base, type Page } from "@playwright/test";
import { HermesV2BrowserGateway } from "./hermes-v2-gateway";
import { enableHermesV2, waitForHermesV2 } from "./helpers/hermes-v2-settings";

const sessionId = "stored-browser";
const root = '[data-hermes-ui="v2"]';
const test = base.extend<{ gateway: HermesV2BrowserGateway }>({
  gateway: async ({ context }, use) => {
    const gateway = new HermesV2BrowserGateway();
    gateway.seed(sessionId);
    await gateway.install(context);
    await enableHermesV2(context);
    try { await use(gateway); }
    finally { gateway.dispose(); }
  },
});

test.use({ extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" }, viewport: { width: 1440, height: 900 } });
const composer = (page: Page) => page.getByRole("textbox", { name: "Nachricht an Hermes" });
const submissions = (gateway: HermesV2BrowserGateway) => gateway.calls.filter((call) => call.op === "message.submit").length;

async function openChat(page: Page): Promise<void> {
  await page.goto(`/wrapt/hermes-v2/standalone?session=${sessionId}`);
  await expect(composer(page)).toBeEnabled();
}

test("erstellt eine eigene Sitzung und behält sie nach erstem Prompt und Reload", async ({ page, gateway }) => {
  await page.goto("/wrapt/hermes-v2/standalone");
  await page.getByRole("button", { name: "Neuer Chat", exact: true }).first().click();
  await page.getByRole("button", { name: "Sitzung erstellen", exact: true }).click();
  await expect(page).toHaveURL(/session=stored-created-1/);
  await expect(composer(page)).toBeEnabled();
  await composer(page).fill("Erster Prompt in einer neuen Sitzung");
  await composer(page).press("Enter");
  await expect(page.getByText("Native Antwort aus dem Browser-Test.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Erster Prompt in einer neuen Sitzung", { exact: true })).toHaveCount(1);
  expect(gateway.calls.filter((call) => call.op === "session.create")).toHaveLength(1);
  expect(submissions(gateway)).toBe(1);
});

test("lädt ältere Historie über eine bedienbare Aktion ohne neue Nachricht", async ({ page, gateway }) => {
  gateway.seedHistory(sessionId, 430);
  await openChat(page);
  await expect(page.getByText("Gespeicherte Nachricht 430", { exact: true })).toBeVisible();
  const older = page.getByRole("button", { name: /Ältere Nachrichten laden/ });
  await older.click();
  await expect(page.getByText("Gespeicherte Nachricht 31", { exact: true })).toHaveCount(1);
  await older.click();
  await expect(page.getByText("Gespeicherte Nachricht 1", { exact: true })).toHaveCount(1);
  await expect(older).toHaveCount(0);
  expect(submissions(gateway)).toBe(0);
});

test("sendet einmal und zeigt dieselbe echte Textantwort nach Reload ohne Duplikate", async ({ page, gateway }) => {
  await openChat(page);
  await composer(page).fill("Ein eigener Browser-Prompt");
  await composer(page).press("Enter");
  await expect(page.getByText("Native Antwort aus dem Browser-Test.", { exact: true })).toBeVisible();
  expect(submissions(gateway)).toBe(1);
  await page.reload();
  await expect(page.getByText("Ein eigener Browser-Prompt", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Native Antwort aus dem Browser-Test.", { exact: true })).toHaveCount(1);
  expect(submissions(gateway)).toBe(1);
});

test("unterscheidet zwei inhaltlich gleiche echte Antworten", async ({ page, gateway }) => {
  await openChat(page);
  for (let index = 0; index < 2; index++) {
    await composer(page).fill("Gleicher gültiger Prompt");
    await composer(page).press("Enter");
    await expect(page.getByText("Native Antwort aus dem Browser-Test.", { exact: true })).toHaveCount(index + 1);
  }
  await page.reload();
  await expect(page.getByText("Gleicher gültiger Prompt", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Native Antwort aus dem Browser-Test.", { exact: true })).toHaveCount(2);
  expect(submissions(gateway)).toBe(2);
});

test("behält Streamtokens vor und nach einem Toolabschluss und zeigt sichtbares Reasoning", async ({ page, gateway }) => {
  gateway.autoComplete = false;
  await openChat(page);
  await composer(page).fill("Ein Tool-Stream");
  await composer(page).press("Enter");
  await expect.poll(() => submissions(gateway)).toBe(1);
  const turnId = gateway.stories.get(sessionId)!.turnId!;
  gateway.delta(sessionId, "Vorher ");
  gateway.emit(sessionId, "tool.started", { toolId: "call-1", name: "browser_tool", input: '{"text":"eigener Input"}', preview: "Eigener Aufruf" });
  gateway.emit(sessionId, "tool.completed", { toolId: "call-1", name: "browser_tool", output: "Eigener Output", durationMs: 12, error: null });
  gateway.delta(sessionId, "nachher");
  gateway.emit(sessionId, "reasoning.delta", { turnId, text: "Vom Modell ausdrücklich gelieferter sichtbarer Inhalt" });
  await expect(page.getByText("Vorher", { exact: true })).toBeVisible();
  await expect(page.getByText("nachher", { exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: "browser_tool" }).click();
  await expect(page.getByText("Eigener Output", { exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: /Gedanken|Reasoning|Denkt nach/ }).click();
  await expect(page.getByText("Vom Modell ausdrücklich gelieferter sichtbarer Inhalt", { exact: true })).toBeVisible();
  gateway.complete(sessionId, "Autoritativer Abschlusstext");
  await expect(page.getByText("Autoritativer Abschlusstext", { exact: true })).toBeVisible();
  await expect(page.getByText("Vorher", { exact: true })).toHaveCount(0);
  await expect(page.getByText("nachher", { exact: true })).toHaveCount(0);
});

test("Stop beendet den laufenden eigenen Turn und bleibt nach dem Antwortbeginn erreichbar", async ({ page, gateway }) => {
  gateway.autoComplete = false;
  await openChat(page);
  await composer(page).fill("Ein langer eigener Turn");
  await composer(page).press("Enter");
  await expect.poll(() => submissions(gateway)).toBe(1);
  gateway.delta(sessionId, "Bereits gelieferte Ausgabe");
  const stop = page.getByRole("button", { name: "Stoppen", exact: true });
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect.poll(() => gateway.calls.filter((call) => call.op === "session.stop").length).toBe(1);
  await expect(page.getByText("Bereits gelieferte Ausgabe", { exact: true })).toBeVisible();
  await composer(page).fill("Nächster Prompt nach Stop");
  await expect(page.getByRole("button", { name: "Senden", exact: true })).toBeEnabled();
});

test("folgt großem Streamwachstum unten und bewahrt bewusstes Lesen weiter oben", async ({ page, gateway }) => {
  gateway.autoComplete = false;
  await openChat(page);
  await composer(page).fill("Ein langer Stream zum Scrollen");
  await composer(page).press("Enter");
  await expect.poll(() => submissions(gateway)).toBe(1);
  const log = page.getByRole("log", { name: "Chatverlauf" });
  gateway.delta(sessionId, Array.from({ length: 80 }, (_, index) => `Streamzeile ${index + 1}\n\n`).join(""));
  await expect.poll(() => log.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(48);
  await log.evaluate((element) => { element.scrollTop = 100; element.dispatchEvent(new Event("scroll")); });
  gateway.delta(sessionId, Array.from({ length: 30 }, (_, index) => `Weitere Streamzeile ${index + 1}\n\n`).join(""));
  await expect(page.getByText("Weitere Streamzeile 30", { exact: true })).toHaveCount(1);
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBe(100);
});

test("zeigt einen Sessionfehler mit bedienbarem Abgleich und ohne erneuten Submit", async ({ page, gateway }) => {
  await openChat(page);
  gateway.emit(sessionId, "session.error", { code: "PROVIDER_LIMIT", message: "Eigener Test: Anbieterkontingent erreicht." });
  const alert = page.getByRole("alert").filter({ hasText: "Eigener Test: Anbieterkontingent erreicht." });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Erneut abgleichen", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await expect(composer(page)).toBeEnabled();
  expect(submissions(gateway)).toBe(0);
});

test("öffnet den Klassisch-Link eines offenen Requests unter dem App-Basispfad", async ({ page, gateway }) => {
  await page.route("**/hermes/**", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>Eigene Classic-Fixture</body></html>" }));
  await openChat(page);
  gateway.emit(sessionId, "request.opened", {
    kind: "approval", key: "11111111-1111-4111-8111-111111111111", epoch: "browser-epoch",
    sessionId, createdAt: Date.now(), method: "approval", command: "echo eigener-test",
    description: "Eigene Freigabe im Browsertest", choices: ["once", "deny"],
  });
  const link = page.getByRole("link", { name: "Klassische Hermes-Oberfläche öffnen", exact: true });
  await expect(link).toHaveAttribute("href", `/wrapt/hermes-agent?ui=classic&session=${sessionId}`);
  await link.click();
  await expect(page).toHaveURL(`/wrapt/hermes-agent?ui=classic&session=${sessionId}`);
  await expect(page.locator("iframe")).toBeVisible();
  expect(submissions(gateway)).toBe(0);
});

test("Shift-Enter und IME senden nicht versehentlich; wiederholtes Enter startet nur einen Send", async ({ page, gateway }) => {
  gateway.autoComplete = false;
  await openChat(page);
  const input = composer(page);
  await input.fill("Erste Zeile");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("Erste Zeile\n");
  await input.dispatchEvent("compositionstart");
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, bubbles: true });
  expect(submissions(gateway)).toBe(0);
  await input.dispatchEvent("compositionend");
  await input.press("Enter");
  await input.press("Enter");
  await expect.poll(() => submissions(gateway)).toBe(1);
});

test("übernimmt bei verlorener Sendeantwort keinen stillen Retry", async ({ page, gateway }) => {
  gateway.autoComplete = false;
  gateway.loseNextSubmitResult = true;
  await openChat(page);
  await composer(page).fill("Möglicherweise schon angenommener Prompt");
  await composer(page).press("Enter");
  await expect.poll(() => gateway.calls.filter((call) => call.op === "session.subscribe").length).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("alert").filter({ hasText: /möglicherweise bereits ausgeführt/i })).toBeVisible();
  await composer(page).press("Enter");
  expect(submissions(gateway)).toBe(1);
  await expect(page.getByRole("button", { name: /Bewusst erneut senden/ })).not.toBeVisible();
  await page.getByRole("button", { name: "Abgleichen", exact: true }).click();
  await expect(page.getByRole("button", { name: /Bewusst erneut senden/ })).toBeVisible();
});

test("lässt nach unbekanntem Sendeausgang ausdrücklich ohne erneutes Senden fortfahren", async ({ page, gateway }) => {
  gateway.autoComplete = false;
  gateway.loseNextSubmitResult = true;
  await openChat(page);
  await composer(page).fill("Möglicherweise bereits übermittelter Prompt");
  await composer(page).press("Enter");
  const continueButton = page.getByRole("button", { name: "Ohne erneutes Senden fortfahren", exact: true });
  await expect(continueButton).toBeVisible();
  await expect.poll(() => gateway.calls.filter((call) => call.op === "session.subscribe").length).toBeGreaterThanOrEqual(2);
  const mutationsBefore = gateway.calls.filter((call) => ["message.submit", "session.stop", "request.respond"].includes(call.op)).length;
  await continueButton.click();
  await expect(continueButton).toHaveCount(0);
  await expect(composer(page)).toHaveValue("");
  expect(submissions(gateway)).toBe(1);
  expect(gateway.calls.filter((call) => ["message.submit", "session.stop", "request.respond"].includes(call.op))).toHaveLength(mutationsBefore);
  gateway.complete(sessionId, "Der ursprüngliche Turn hat geantwortet");
  await expect(page.getByText("Der ursprüngliche Turn hat geantwortet", { exact: true })).toBeVisible();
});

test("zwei Browserflächen sehen denselben Stream und schließen keine fremde Fläche", async ({ page, context, gateway }) => {
  await openChat(page);
  const other = await context.newPage();
  await openChat(other);
  await expect.poll(() => gateway.viewers.size).toBe(2);
  await composer(page).fill("Nachricht aus dem ersten Tab");
  await composer(page).press("Enter");
  await expect(other.getByText("Native Antwort aus dem Browser-Test.", { exact: true })).toBeVisible();
  await page.close();
  await expect.poll(() => gateway.viewers.size).toBe(1);
  await composer(other).fill("Nachricht aus dem verbleibenden Tab");
  await composer(other).press("Enter");
  await expect(other.getByText("Native Antwort aus dem Browser-Test.", { exact: true })).toHaveCount(2);
  expect(submissions(gateway)).toBe(2);
  await other.close();
});

test("Flag-off während eines Turns schließt V2-Traffic ohne Stop und stellt nach Aktivierung den Turn wieder her", async ({ page, context, gateway }) => {
  gateway.autoComplete = false;
  await page.clock.install();
  await openChat(page);
  await composer(page).fill("Eigener weiterlaufender Turn");
  await composer(page).press("Enter");
  await expect.poll(() => submissions(gateway)).toBe(1);
  gateway.delta(sessionId, "Bereits eingetroffener Teil");
  const settings = await context.newPage();
  await settings.goto("/wrapt/settings#einstellungen:experimente");
  const toggle = settings.getByRole("switch", { name: /Hermes V2 aktivieren/ });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await waitForHermesV2(settings, false);
  await expect(page.locator(root)).toHaveCount(0);
  await expect.poll(() => gateway.viewers.size).toBe(0);
  const afterDisable = gateway.calls.length;
  await gateway.disconnect();
  await page.clock.fastForward(20_000);
  await expect(page.getByRole("switch", { name: /Hermes V2 aktivieren/ })).not.toBeChecked();
  expect(gateway.calls.length).toBe(afterDisable);
  expect(gateway.stories.get(sessionId)!.snapshot.running).toBe(true);
  expect(gateway.calls.filter((call) => call.op === "session.stop")).toHaveLength(0);
  await toggle.click();
  await expect(composer(page)).toBeVisible();
  await expect.poll(() => gateway.viewers.size).toBe(1);
  await expect(page.getByText("Bereits eingetroffener Teil", { exact: true })).toBeVisible();
  gateway.complete(sessionId, "Nach Flag-Wechsel vollständig abgeschlossen");
  await expect(page.getByText("Nach Flag-Wechsel vollständig abgeschlossen", { exact: true })).toBeVisible();
  expect(submissions(gateway)).toBe(1);
  await settings.close();
});

test("rendert Markdown und externe Links ohne aktive HTML-Inhalte", async ({ page, gateway }) => {
  gateway.autoComplete = false;
  await openChat(page);
  await composer(page).fill("Eine Markdown-Antwort");
  await composer(page).press("Enter");
  await expect.poll(() => submissions(gateway)).toBe(1);
  gateway.complete(sessionId, '**Lesbarer Text**\n\n[Beispiel](https://example.org/)\n\n<img src=x onerror="alert(1)"><script>alert(1)</script>\n\n[Unsicher](javascript:alert(1))\n\n```js\nconst eigenerCode = 1;\n```');
  await expect(page.locator(`${root} strong`).filter({ hasText: "Lesbarer Text" })).toBeVisible();
  const external = page.getByRole("link", { name: "Beispiel", exact: true });
  await expect(external).toHaveAttribute("rel", /noopener/);
  await expect(page.locator(`${root} script, ${root} iframe, ${root} [onerror], ${root} a[href^="javascript:"]`)).toHaveCount(0);
  await expect(page.locator(`${root} pre code`)).toContainText("const eigenerCode = 1;");
});
