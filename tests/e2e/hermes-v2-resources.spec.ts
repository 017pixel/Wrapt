import { expect } from "@playwright/test";
import { resourceTest as test, prepareResources, openResources, selectArea, areaTab,
  resourceRegion, resourceWrites, composerInput, sessionId } from "./hermes-v2-resource-fixture";
import { openSecret, requestCard } from "./hermes-v2-request-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareResources(gateway));

test("erhält Chatentwurf und bestehende Verbindung über mehrere Ressourcenflächen", async ({ page, gateway }) => {
  await openResources(page, "Chat");
  await composerInput(page).fill("Eigener erhaltener Ressourcenentwurf");
  expect(gateway.resources.calls).toHaveLength(0);
  const subscriptions = gateway.calls.filter((call) => call.op === "session.subscribe").length;
  await selectArea(page, "Cron");
  await expect(page.getByRole("button", { name: "Cron-Job: Eigener Prüfjob", exact: true })).toBeVisible();
  await expect(composerInput(page)).toHaveCount(0);
  await selectArea(page, "Memory");
  await expect(page.getByText("Eigene synthetische Projektnotiz", { exact: true })).toBeVisible();
  expect(gateway.viewers.size).toBe(1);
  expect(gateway.calls.filter((call) => call.op === "session.subscribe")).toHaveLength(subscriptions);
  await selectArea(page, "Chat");
  await expect(composerInput(page)).toHaveValue("Eigener erhaltener Ressourcenentwurf");
  expect(gateway.calls.filter((call) => call.op === "session.stop")).toHaveLength(0);
});

test("entfernt Secret-DOM beim Bereichswechsel und stellt nur eine leere Eingabe wieder her", async ({ page, gateway }) => {
  await openResources(page, "Chat");
  const request = openSecret(gateway);
  const input = requestCard(page, request).locator('input[type="password"]');
  await input.fill("Nur-ein-synthetischer-Ressourcenwert");
  await selectArea(page, "Memory");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(gateway.requests.observations).toHaveLength(0);
  await selectArea(page, "Chat");
  await expect(input).toHaveValue("");
  expect(gateway.calls.filter((call) => call.op === "request.respond")).toHaveLength(0);
});

test("bestätigt eine neue Antwort hinter Cron erst nach sichtbarer Rückkehr zum Chat", async ({ page, gateway }) => {
  await openResources(page);
  gateway.stories.get(sessionId)!.turnId = "resource-hidden-answer";
  const handle = gateway.organization.newAnswer(sessionId);
  gateway.complete(sessionId, "Eigene Antwort hinter der Ressourcenfläche", "completed", handle);
  await expect(page.getByRole("button", { name: "Cron-Job: Eigener Prüfjob", exact: true })).toBeVisible();
  expect(gateway.organization.calls.filter((call) => call.path === "/organization/read")).toHaveLength(0);
  await selectArea(page, "Chat");
  await expect(page.getByText("Eigene Antwort hinter der Ressourcenfläche", { exact: true })).toBeVisible();
  await expect.poll(() => gateway.organization.calls.filter((call) => call.path === "/organization/read").length).toBeGreaterThan(0);
});

test("verwirft eine gehaltene Memoryantwort über Memory-Cron-Memory", async ({ page, gateway }) => {
  gateway.resources.holdReadPaths.add("/memory");
  gateway.resources.memory.files[0]!.text = "Überholter eigener Memorytext";
  await openResources(page, "Memory");
  await expect.poll(() => gateway.resources.calls.filter((call) => call.path === "/memory").length).toBe(1);
  await selectArea(page, "Cron");
  gateway.resources.memory.files[0]!.text = "Frischer eigener Memorytext";
  gateway.resources.holdReadPaths.delete("/memory");
  await selectArea(page, "Memory");
  await expect(page.getByText("Frischer eigener Memorytext", { exact: true })).toBeVisible();
  await gateway.resources.finishReads();
  await expect(resourceRegion(page, "memory")).not.toContainText("Überholter eigener Memorytext");
});

test("zeigt Memory-Fehler statt einer erfolgreichen leeren Datei und liest bewusst neu", async ({ page, gateway }) => {
  gateway.resources.failNextRead = { code: "RESOURCE_UNAVAILABLE", outcome: "not_sent", retryable: false,
    message: "Eigener Memorylesefehler" };
  gateway.resources.failReadPath = "/memory";
  await openResources(page, "Memory");
  await expect(resourceRegion(page, "memory")).toContainText("Eigener Memorylesefehler");
  await resourceRegion(page, "memory").getByRole("alert").getByRole("button", { name: "Memory aktualisieren", exact: true }).click();
  await expect(page.getByText("Eigene synthetische Projektnotiz", { exact: true })).toBeVisible();
  expect(resourceWrites(gateway)).toHaveLength(0);
});

test("zeigt echte Pendingteilbelege und sperrt native nicht unterstützte Entscheidungen", async ({ page, gateway }) => {
  await openResources(page, "Memory");
  await expect(page.getByText("Eigener ausstehender Memoryvorschlag", { exact: true })).toBeVisible();
  await expect(resourceRegion(page, "memory")).toContainText(/unvollständig|gekürzt|Teilabdeckung/i);
  const approvals = page.getByRole("button", { name: /^Freigeben:/ });
  const rejects = page.getByRole("button", { name: /^Ablehnen:/ });
  expect(await approvals.count()).toBeGreaterThan(0);
  for (const button of [...await approvals.all(), ...await rejects.all()]) await expect(button).toBeDisabled();
  expect(resourceWrites(gateway)).toHaveLength(0);
});

test("stellt Builtintexte bei externem Provider nur als begrenzten Dateispeicher dar", async ({ page, gateway }) => {
  gateway.resources.memory.active = "external-test";
  gateway.resources.memory.providers.push({ name: "external-test", description: "Externer Prüfprovider",
    available: true, configured: true, status: "active", setup: null });
  gateway.resources.memory.files[0]!.truncated = true;
  gateway.resources.memory.truncated = true;
  await openResources(page, "Memory");
  await expect(resourceRegion(page, "memory")).toContainText("Externer Prüfprovider");
  await expect(resourceRegion(page, "memory")).toContainText(/Builtin|Dateien|Dateispeicher/i);
  await expect(resourceRegion(page, "memory")).toContainText(/gekürzt|unvollständig/i);
  expect(resourceWrites(gateway)).toHaveLength(0);
});

test("sucht kataloggebundene Skills und öffnet den vorhandenen Editorlink", async ({ page, gateway }) => {
  await openResources(page, "Skills");
  const search = page.getByRole("searchbox", { name: /^Skills nach .*Name.*Slashbefehl suchen$/ });
  await search.fill("/eigener-browser-skill");
  await page.getByRole("button", { name: "Skill: eigener-browser-skill", exact: true }).click();
  const content = resourceRegion(page, "skills").getByLabel("Inhalt: eigener-browser-skill", { exact: true });
  await expect(content).toBeVisible();
  await expect(content).toContainText("Nur synthetischer Inhalt.");
  await expect(page.getByRole("link", { name: "Im KI-Skills-Editor öffnen", exact: true }).first()).toHaveAttribute("href", /\/ki-skills$/);
  expect(gateway.resources.calls.filter((call) => call.path === "/skills/detail")).toHaveLength(1);
  expect(resourceWrites(gateway)).toHaveLength(0);
});

test("führt untrusted Memory- und Skilltexte nicht als HTML aus", async ({ page, gateway }) => {
  const untrusted = '<img src=x onerror="window.ownUnexpectedMarkup=true"><script>window.ownUnexpectedMarkup=true</script>';
  gateway.resources.memory.files[0]!.text = untrusted;
  gateway.resources.skillContent = `Eigener geprüfter Skilltext\n\n${untrusted}`;
  await openResources(page, "Memory");
  await expect(resourceRegion(page, "memory")).toContainText("ownUnexpectedMarkup");
  await selectArea(page, "Skills");
  await page.getByRole("button", { name: "Skill: eigener-browser-skill", exact: true }).click();
  await expect(resourceRegion(page, "skills")).toContainText("Eigener geprüfter Skilltext");
  expect(await page.evaluate(() => Boolean((window as Window & { ownUnexpectedMarkup?: boolean }).ownUnexpectedMarkup))).toBe(false);
  await expect(resourceRegion(page, "skills").locator("script, img[onerror]")).toHaveCount(0);
});

test("kopiert die redigierte Diagnose ausschließlich nach Nutzeraktion", async ({ page, context, gateway }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openResources(page, "Diagnose");
  await expect(resourceRegion(page, "diagnostics")).toContainText("Eigener redigierter Agentlog");
  await page.getByRole("button", { name: "Diagnose kopieren", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("token=***");
  expect(resourceWrites(gateway)).toHaveLength(0);
});

test("meldet einen tatsächlichen Clipboardfehler ohne Kopiererfolg", async ({ page, gateway }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true,
    value: { writeText: () => Promise.reject(new Error("Synthetisch verweigert")) } }));
  await openResources(page, "Diagnose");
  await expect(page.getByRole("button", { name: "Diagnose kopieren", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Diagnose kopieren", exact: true }).click();
  await expect(resourceRegion(page, "diagnostics").getByRole("alert")).toContainText(/kopier|Zwischenablage/i);
  await expect(resourceRegion(page, "diagnostics").getByText(/^Diagnose kopiert\.?$/i)).toHaveCount(0);
  expect(resourceWrites(gateway)).toHaveLength(0);
});

test("liest Cron nur nach echter Invalidierung und nicht bei Tokenereignissen", async ({ page, gateway }) => {
  await openResources(page);
  await expect(page.getByRole("button", { name: "Cron-Job: Eigener Prüfjob", exact: true })).toBeVisible();
  const count = () => gateway.resources.calls.filter((call) => call.path === "/cron/jobs").length;
  const before = count();
  gateway.stories.get(sessionId)!.turnId = "resource-passive-tokens";
  for (let i = 0; i < 50; i++) gateway.delta(sessionId, "Token ");
  await expect(areaTab(page, "Cron")).toHaveAttribute("aria-selected", "true");
  expect(count()).toBe(before);
  gateway.resources.invalidate();
  await expect.poll(count).toBeGreaterThan(before);
  await selectArea(page, "Skills");
  const after = count();
  gateway.resources.invalidate();
  expect(count()).toBe(after);
  expect(gateway.viewers.size).toBe(1);
});
