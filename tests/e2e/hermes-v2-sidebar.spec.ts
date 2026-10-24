import { expect, test as base, type Page } from "@playwright/test";
import { HermesV2BrowserGateway } from "./hermes-v2-gateway";
import { enableHermesV2, openHermesV2Settings, waitForHermesV2, waitForHermesV2SyncPending } from "./helpers/hermes-v2-settings";

const firstId = "sidebar-first";
const secondId = "sidebar-second";
const firstTitle = "Gateway-Anbindung prüfen";
const secondTitle = "Dokumentation ergänzen";
const test = base.extend<{ gateway: HermesV2BrowserGateway }>({
  gateway: async ({ context }, use) => {
    const gateway = new HermesV2BrowserGateway();
    gateway.seed(firstId, firstTitle);
    gateway.seed(secondId, secondTitle);
    await gateway.install(context);
    await enableHermesV2(context);
    try { await use(gateway); }
    finally { gateway.dispose(); }
  },
});

test.use({ extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" }, viewport: { width: 1440, height: 900 } });
const shelf = (page: Page, id: string) => page.locator(`[data-hermes-shelf="${id}"]`);
const actionCalls = (gateway: HermesV2BrowserGateway) => gateway.organization.calls.filter((call) => call.path === "/organization/action");

async function openSidebar(page: Page, sessionId = firstId): Promise<void> {
  await page.goto(`/wrapt/hermes-v2/standalone?session=${sessionId}`);
  await expect(page.getByRole("textbox", { name: "Nachricht an Hermes" })).toBeEnabled();
  await expect(shelf(page, "active").getByText(firstTitle, { exact: true })).toBeVisible();
}

async function action(page: Page, title: string, label: string): Promise<void> {
  await page.getByRole("button", { name: title, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

async function expand(page: Page, group: string): Promise<void> {
  const button = shelf(page, group).locator(".hermesv2-shelf-collapse[aria-expanded='false']");
  if (await button.count()) await button.click();
}

test("organisiert eine Sitzung mit Pin, Erledigen und Rückgängig ohne Hermes-Turnmutation", async ({ page, gateway }) => {
  await openSidebar(page);
  await action(page, firstTitle, "Anheften");
  await expect(shelf(page, "pinned").getByText(firstTitle, { exact: true })).toBeVisible();
  await action(page, firstTitle, "Erledigen");
  await expand(page, "settled");
  await expect(shelf(page, "settled").getByText(firstTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rückgängig", exact: true })).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(shelf(page, "pinned").getByText(firstTitle, { exact: true })).toBeVisible();
  await page.reload();
  await expect(shelf(page, "pinned").getByText(firstTitle, { exact: true })).toBeVisible();
  expect(actionCalls(gateway)).toHaveLength(2);
  expect(gateway.calls.filter((call) => ["message.submit", "session.stop", "request.respond"].includes(call.op))).toHaveLength(0);
});

test("zeigt viele Summaries und zwanzig Working-Sitzungen mit nur einer vollständigen Chatlease", async ({ page, gateway }) => {
  for (let index = 0; index < 50; index++) {
    const id = `sidebar-extra-${index}`;
    gateway.seed(id, `Aufgabe ${index + 1}`, Date.now() - 60_000);
    gateway.organization.setActivity(id, index < 20 ? "working" : "idle");
  }
  gateway.organization.setActivity(secondId, "waiting_input");
  await openSidebar(page);
  await expect(shelf(page, "needs-input").getByText(secondTitle, { exact: true })).toBeVisible();
  await expand(page, "working");
  await expect(shelf(page, "working").locator("[data-session-id]").first()).toBeVisible();
  expect(gateway.calls.filter((call) => call.op === "session.subscribe")).toHaveLength(1);
  expect(gateway.viewers.size).toBe(1);
  await expect(page.locator("[data-hermes-shelf]").getByText(secondTitle, { exact: true })).toHaveCount(1);
});

test("zeigt belegte Arbeit und Laufzeit auch bei angehefteten Sitzungen", async ({ page, gateway }) => {
  gateway.organization.setActivity(secondId, "working");
  await openSidebar(page);
  await expand(page, "working");
  await action(page, secondTitle, "Anheften");
  gateway.organization.setActivity(secondId, "working");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Nachricht an Hermes" })).toBeEnabled();
  const row = shelf(page, "pinned").locator(`[data-session-id="${secondId}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByText("Ruhend", { exact: true })).toHaveCount(0);
});

test("sucht Titel und CWD über explizit weitere native Summaryseiten", async ({ page, gateway }) => {
  for (let index = 0; index < 120; index++) gateway.seed(`sidebar-search-${index}`, `Archivierte Aufgabe ${index}`, Date.now() - 60_000);
  const target = gateway.seed("sidebar-found", "Seltene Suchantwort");
  target.session.cwd = "/projekte/eigener-suchpfad";
  await openSidebar(page);
  const search = page.getByRole("searchbox", { name: /Sitzungen/ });
  await search.fill("eigener-suchpfad");
  await expect(page.getByText(/unvollständig|weitere Sitzungen|weitere Seiten|nur geladene Seiten/i).first()).toBeVisible();
  await page.getByRole("button", { name: /Mehr laden|Weitere Sitzungen|Weitere Treffer/i }).first().click();
  await expect(page.getByText("Seltene Suchantwort", { exact: true })).toBeVisible();
  expect(gateway.organization.calls.filter((call) => call.path === "/sessions").length).toBeGreaterThanOrEqual(3);
});

test("lädt weitere normale Inbox-Sitzungen beim Scrollen ans Ende nach", async ({ page, gateway }) => {
  for (let index = 0; index < 130; index++) gateway.seed(`sidebar-page-${index}`, `Weitere Aufgabe ${index}`, Date.now() - 60_000);
  await openSidebar(page);
  const list = page.locator(".hermesv2-shelves");
  await list.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => gateway.organization.calls.filter((call) => call.path === "/sessions").length).toBeGreaterThanOrEqual(2);
});

test("zeigt einen Organisationskonflikt und wiederholt die Mutation nicht automatisch", async ({ page, gateway }) => {
  await openSidebar(page);
  gateway.organization.rejectNextAction = true;
  await action(page, firstTitle, "Anheften");
  await expect(page.getByRole("alert").filter({ hasText: /geändert|Konflikt|erneut/i })).toBeVisible();
  expect(actionCalls(gateway)).toHaveLength(1);
  await expect(shelf(page, "active").getByText(firstTitle, { exact: true })).toBeVisible();
});

test("stellt mit sichtbarer Wakezeit zurück und weckt per Menü ohne Agentenstop", async ({ page, gateway }) => {
  await openSidebar(page);
  await action(page, secondTitle, "Zurückstellen");
  const dialog = page.getByRole("dialog", { name: "Sitzung zurückstellen", exact: true });
  await dialog.getByRole("radio", { name: "30 Minuten", exact: true }).check();
  await expect(dialog.getByRole("status")).toContainText(/bis/);
  const before = Date.now();
  await dialog.getByRole("button", { name: "Zurückstellen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expand(page, "snoozed");
  await expect(shelf(page, "snoozed").getByText(secondTitle, { exact: true })).toBeVisible();
  const item = gateway.organization.item(secondId);
  expect(item.snoozedUntil).toBeGreaterThan(before + 29 * 60_000);
  expect(item.snoozedUntil).toBeLessThan(Date.now() + 31 * 60_000);
  await action(page, secondTitle, "Jetzt wecken");
  await expect(shelf(page, "active").getByText(secondTitle, { exact: true })).toBeVisible();
  expect(gateway.calls.filter((call) => call.op === "session.stop")).toHaveLength(0);
});

test("verschiebt per Drag nach Erledigt und bietet dieselbe Aktion per Tastaturmenü", async ({ page, gateway }) => {
  await openSidebar(page);
  const source = page.locator(`.hermesv2-rowitem[data-session-id="${secondId}"]`);
  await source.dragTo(shelf(page, "settled"));
  await expand(page, "settled");
  await expect(shelf(page, "settled").getByText(secondTitle, { exact: true })).toBeVisible();
  const menu = page.getByRole("button", { name: secondTitle, exact: true });
  await menu.focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Wieder aktiv", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(shelf(page, "active").getByText(secondTitle, { exact: true })).toBeVisible();
  expect(actionCalls(gateway)).toHaveLength(2);
});

// FIXME: Die Pin-Reihenfolge ist erst nach der vollständigen Mitgliederliste bedienbar;
// die isolierte Testinstanz liefert diese Teilliste nicht. Der Drag selbst bleibt im
// Sidebar-Unit-Test abgedeckt.
test.fixme("ordnet angeheftete Sitzungen per Drag neu", async ({ page, gateway }) => {
  await openSidebar(page);
  await action(page, firstTitle, "Anheften");
  await action(page, secondTitle, "Anheften");
  await expand(page, "pinned");
  const source = page.locator(`.hermesv2-rowitem[data-session-id="${firstId}"]`);
  const target = page.locator(`.hermesv2-rowitem[data-session-id="${secondId}"]`);
  await source.dragTo(target, { targetPosition: { x: 20, y: 2 } });
  await expect.poll(() => gateway.organization.item(firstId).pinRank).toBe(0);
  expect(gateway.organization.calls.filter((call) => call.path === "/organization/reorder")).toHaveLength(1);
});

test("hält Aktionen der letzten erledigten Sitzung auch am unteren Rand erreichbar", async ({ page, gateway }) => {
  for (let index = 0; index < 15; index++) gateway.seed(`sidebar-menu-${index}`, `Ältere Aufgabe ${index}`, Date.now() - 60_000);
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const item = gateway.organization.item(secondId);
    item.settledAt = item.effectiveSettledAt = Date.now();
    gateway.organization.metadata.set(secondId, item);
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto(`/wrapt/hermes-v2/standalone?session=${firstId}`);
    await expect(page.getByRole("textbox", { name: "Nachricht an Hermes" })).toBeEnabled();
    if (width! < 640) {
      await page.locator(".hermesv2-drawer-toggle").click();
      await expect(page.getByRole("dialog", { name: "Hermes-V2-Sitzungen", exact: true })).toBeVisible();
      await page.waitForFunction(() => document.querySelector(".hermesv2-sidebar")!.getBoundingClientRect().left >= -0.1);
    }
    await expand(page, "settled");
    const row = shelf(page, "settled").locator(`.hermesv2-rowitem[data-session-id="${secondId}"]`);
    await row.scrollIntoViewIfNeeded();
    const trigger = row.getByRole("button", { name: secondTitle, exact: true });
    await trigger.click({ button: "right" });
    await expect(page.getByRole("menu", { name: `Aktionen für ${secondTitle}` })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Wieder aktiv", exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByRole("menuitem", { name: "Wieder aktiv", exact: true }).click();
    await expect(shelf(page, "active").getByText(secondTitle, { exact: true })).toBeVisible();
  }
});

test("bestätigt ungesehene Antworten erst nach sichtbarem Chat und weckt dauerhaft", async ({ page, gateway }) => {
  const item = gateway.organization.item(secondId);
  item.snoozedAt = Date.now();
  item.snoozedUntil = item.effectiveSnoozedUntil = Date.now() + 3_600_000;
  gateway.organization.metadata.set(secondId, item);
  await openSidebar(page);
  const story = gateway.stories.get(secondId)!;
  story.turnId = "sidebar-own-turn";
  const handle = gateway.organization.newAnswer(secondId);
  gateway.complete(secondId, "Eigene neue Antwort für die ungesehene Sitzung", "completed", handle);
  await expect(shelf(page, "needs-input").getByText(secondTitle, { exact: true })).toBeVisible();
  expect(gateway.organization.calls.filter((call) => call.path === "/organization/read")).toHaveLength(0);
  await shelf(page, "needs-input").getByText(secondTitle, { exact: true }).click();
  await expect(page.getByText("Eigene neue Antwort für die ungesehene Sitzung", { exact: true })).toBeVisible();
  await expect.poll(() => gateway.organization.calls.filter((call) => call.path === "/organization/read").length).toBeGreaterThan(0);
  await expect(shelf(page, "active").getByText(secondTitle, { exact: true })).toBeVisible();
  await expect(shelf(page, "snoozed").getByText(secondTitle, { exact: true })).toHaveCount(0);
  expect(gateway.organization.item(secondId).effectiveSnoozedUntil).toBeNull();
});

test("organisiert eine bekannte ungelesene Antwort ohne einen Read vorzutäuschen", async ({ page, gateway }) => {
  await openSidebar(page);
  gateway.stories.get(secondId)!.turnId = "sidebar-known-answer";
  const handle = gateway.organization.newAnswer(secondId);
  gateway.complete(secondId, "Bereits bekannte ungelesene Antwort", "completed", handle);
  await expect(shelf(page, "needs-input").getByText(secondTitle, { exact: true })).toBeVisible();
  await action(page, secondTitle, "Zurückstellen");
  const dialog = page.getByRole("dialog", { name: "Sitzung zurückstellen", exact: true });
  await dialog.getByRole("button", { name: "Zurückstellen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expand(page, "snoozed");
  await expect(shelf(page, "snoozed").getByText(secondTitle, { exact: true })).toBeVisible();
  expect(gateway.organization.item(secondId).attention.latest?.unread).toBe(true);
  expect(gateway.organization.calls.filter((call) => call.path === "/organization/read")).toHaveLength(0);
});

test("liest eine neue lange Antwort hinter dem mobilen Drawer erst nach dessen Schließen", async ({ page, gateway }) => {
  await openSidebar(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.getByRole("button", { name: "Sitzungen", exact: true });
  await toggle.click();
  await expect(page.getByRole("dialog", { name: "Hermes-V2-Sitzungen", exact: true })).toBeVisible();
  gateway.stories.get(firstId)!.turnId = "sidebar-long-answer";
  const handle = gateway.organization.newAnswer(firstId);
  const text = Array.from({ length: 100 }, (_, index) => `Eigener langer Absatz ${index + 1}.\n\n`).join("");
  gateway.complete(firstId, text, "completed", handle);
  await expect(shelf(page, "needs-input").getByText(firstTitle, { exact: true })).toBeVisible();
  expect(gateway.organization.calls.filter((call) => call.path === "/organization/read")).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Eigener langer Absatz 100.", { exact: true })).toBeVisible();
  await expect.poll(() => gateway.organization.calls.filter((call) => call.path === "/organization/read").length).toBeGreaterThan(0);
});

test("bedient mobile Snooze- und Neue-Sitzung-Dialoge innerhalb des geöffneten Drawers", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/wrapt/hermes-v2/standalone?session=${firstId}`);
  await expect(page.getByRole("textbox", { name: "Nachricht an Hermes" })).toBeEnabled();
  await page.locator(".hermesv2-drawer-toggle").click();
  await action(page, secondTitle, "Zurückstellen");
  const snooze = page.getByRole("dialog", { name: "Sitzung zurückstellen", exact: true });
  const radio = snooze.getByRole("radio", { name: "1 Stunde", exact: true });
  await radio.check();
  await expect(radio).toBeFocused();
  await snooze.getByRole("radio", { name: "Eigene Zeit", exact: true }).check();
  for (const label of ["Datum", "Uhrzeit"]) {
    const input = snooze.getByLabel(label, { exact: true });
    await input.focus();
    await expect(input).toBeFocused();
    expect(await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  }
  await page.keyboard.press("Escape");
  await expect(snooze).toHaveCount(0);
  const drawer = page.getByRole("dialog", { name: "Hermes-V2-Sitzungen", exact: true });
  await expect(drawer).toBeVisible();
  await expect.poll(() => drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await drawer.getByRole("button", { name: "Neuer Chat", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Neue Sitzung", exact: true });
  await expect(create).toBeVisible();
  await create.getByRole("button", { name: "Dialog schließen", exact: true }).click();
  await expect(create).toHaveCount(0);
  expect(actionCalls(gateway)).toHaveLength(0);
  expect(gateway.calls.filter((call) => call.op === "session.create")).toHaveLength(0);
});

test("beendet auch Organisationstraffic beim Abschalten des Flags", async ({ page, context, gateway }) => {
  await page.clock.install();
  await openSidebar(page);
  const settings = await context.newPage();
  try {
    await openHermesV2Settings(settings);
    await settings.bringToFront();
    await expect.poll(() => settings.evaluate(() => document.visibilityState)).toBe("visible");
    const toggle = settings.getByRole("switch", { name: /Hermes V2 aktivieren/ });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await waitForHermesV2SyncPending(settings);
    await settings.clock.runFor(500);
    await waitForHermesV2(settings, false);
    await expect(page.locator('[data-hermes-ui="v2"]')).toHaveCount(0);
    await expect.poll(() => gateway.viewers.size).toBe(0);
    const calls = gateway.organization.calls.length;
    await page.clock.fastForward(20_000);
    expect(gateway.organization.calls).toHaveLength(calls);
  } finally {
    await settings.close();
    await enableHermesV2(context);
  }
});

test("behält Collapse nach Reload und macht mobile Aktionen per Tastatur erreichbar", async ({ page, gateway }) => {
  gateway.organization.setActivity(secondId, "working");
  await openSidebar(page);
  await expand(page, "working");
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.getByRole("button", { name: "Sitzungen", exact: true });
  await toggle.focus();
  await page.keyboard.press("Enter");
  const search = page.getByRole("searchbox", { name: /Sitzungen/ });
  await expect(search).toBeVisible();
  expect(await search.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  const menu = page.getByRole("button", { name: firstTitle, exact: true });
  const size = await menu.boundingBox();
  expect(Math.round(size!.width * 100) / 100).toBeGreaterThanOrEqual(44);
  expect(Math.round(size!.height * 100) / 100).toBeGreaterThanOrEqual(44);
  await menu.focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Anheften", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => actionCalls(gateway).length).toBe(1);
  expect(gateway.organization.item(firstId).pinRank).not.toBeNull();
  await expect(shelf(page, "pinned").getByText(firstTitle, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});
