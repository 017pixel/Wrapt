import { expect } from "@playwright/test";
import { composerTest as test, prepareComposer, openComposer, modelPicker,
  composerInput, fileInput, mutationCalls, sessionId } from "./hermes-v2-composer-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareComposer(gateway));

test("öffnet die lokale Hilfe per Tastatur und kehrt ohne gesendete Nachricht zurück", async ({ page, gateway }) => {
  await openComposer(page);
  const input = composerInput(page);
  await input.fill("/");
  const palette = page.getByRole("listbox", { name: "Hermes-Befehle", exact: true });
  await expect(palette).toBeVisible();
  const options = await palette.getByRole("option").evaluateAll((nodes) =>
    nodes.map((option) => ({ key: option.getAttribute("data-slash-key"),
      selected: option.getAttribute("aria-selected") === "true" })));
  const helpIndex = options.findIndex((option) => option.key === "/help");
  const initialIndex = options.findIndex((option) => option.selected);
  expect(helpIndex).toBeGreaterThanOrEqual(0);
  expect(initialIndex).toBeGreaterThanOrEqual(0);
  await input.focus();
  for (let index = initialIndex; index !== helpIndex; index += index < helpIndex ? 1 : -1) {
    await input.press(index < helpIndex ? "ArrowDown" : "ArrowUp");
  }
  await expect(palette.locator('[data-slash-key="/help"]')).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  const help = page.getByRole("dialog", { name: "Hilfe: Hermes-Befehle", exact: true });
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(input).toHaveValue("");
  expect(mutationCalls(gateway, "message.submit")).toHaveLength(0);
  expect(mutationCalls(gateway, "session.create")).toHaveLength(0);
});

test("sperrt die Modellwahl einer nur lesbaren Sitzung bereits am Einstieg", async ({ page, gateway }) => {
  const snapshot = gateway.stories.get(sessionId)!.snapshot;
  snapshot.writable = false;
  snapshot.blockedReason = "Diese eigene Sitzung ist nur lesbar.";
  await page.goto(`/wrapt/hermes-v2/standalone?session=${sessionId}`);
  await expect(composerInput(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Modell wählen", exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog", { name: "Modell und Anbieter", exact: true })).toHaveCount(0);
  expect(mutationCalls(gateway, "model.select")).toHaveLength(0);
});

test("behält den Hinweis auf übersprungene Dateien bis zum nächsten Uploadbatch", async ({ page, gateway }) => {
  await openComposer(page);
  const files = Array.from({ length: 11 }, (_, index) => ({ name: `batch-${index}.txt`,
    mimeType: "text/plain", buffer: Buffer.from(`Eigene synthetische Datei ${index}`) }));
  await fileInput(page).setInputFiles(files);
  await expect(page.locator('[data-upload-status="ready"]')).toHaveCount(10);
  await expect(page.getByText(/1 übersprungen/)).toBeVisible();
  expect(gateway.attachments.calls.filter((call) => call.kind === "upload")).toHaveLength(10);
  await page.getByRole("button", { name: "Anhang batch-0.txt entfernen", exact: true }).click();
  await fileInput(page).setInputFiles({ name: "neuer-batch.txt", mimeType: "text/plain",
    buffer: Buffer.from("Neue ausdrückliche Auswahl") });
  await expect(page.locator('[data-upload-status="ready"]')).toHaveCount(10);
  await expect(page.getByText(/übersprungen/)).toHaveCount(0);
  expect(gateway.attachments.calls.filter((call) => call.kind === "upload")).toHaveLength(11);
  expect(mutationCalls(gateway, "message.submit")).toHaveLength(0);
});

test("öffnet die Modellsuche nach dem Schließen wieder ohne den alten Filter", async ({ page }) => {
  await openComposer(page);
  const first = await modelPicker(page);
  await first.getByRole("searchbox", { name: "Modelle suchen", exact: true }).fill("Kein eigenes Testmodell");
  await expect(first.locator("[data-model-id]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(first).toHaveCount(0);
  const reopened = await modelPicker(page);
  await expect(reopened.getByRole("searchbox", { name: "Modelle suchen", exact: true })).toHaveValue("");
  await expect(reopened.locator('[data-model-id="browser-model"]')).toBeVisible();
});

test("öffnet den klassischen Einstieg eines nicht unterstützten Befehls unter dem App-Basispfad", async ({ page, gateway }) => {
  await openComposer(page);
  await composerInput(page).fill("/update jetzt");
  await composerInput(page).press("Enter");
  const classic = page.getByRole("link", { name: "Klassische Hermes-Oberfläche öffnen", exact: true });
  await expect(classic).toBeVisible();
  await classic.click();
  await expect(page).toHaveURL(new RegExp(`/wrapt/hermes-agent\\?ui=classic&session=${sessionId}$`));
  await expect(page.locator('[data-hermes-ui="official"]')).toBeVisible();
  await expect(page.locator('iframe[title="Hermes Agent"]')).toHaveAttribute("src", `/hermes/chat?resume=${sessionId}`);
  expect(mutationCalls(gateway, "message.submit")).toHaveLength(0);
});
