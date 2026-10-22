import { expect } from "@playwright/test";
import { workTest as test, prepareWork, openWork, workRegion, workRow, sessionId,
  composerInput as input, queueButton, clickVisible, settleAnimations } from "./hermes-v2-work-fixture";
import { fileInput } from "./hermes-v2-composer-fixture";
import { openApproval } from "./hermes-v2-request-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });
test.beforeEach(({ gateway }) => prepareWork(gateway, true));

for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]] as const) {
  test(`hält die Aufgabenansicht und den Hauptstop bei ${width}×${height} bedienbar`, async ({ page, gateway }) => {
    await page.setViewportSize({ width, height });
    for (let index = 0; index < 12; index++) gateway.work.seedSubagent(sessionId, `layout-child-${index}`,
      { goal: `Eigene Layoutaufgabe ${index}`, status: "running", depth: 0 });
    await openWork(page);
    await expect(page.locator('[data-hermes-work-kind="subagent"]')).toHaveCount(12);
    await input(page).fill("Eigene sichtbare Folge");
    await expect(queueButton(page)).toBeEnabled();
    await settleAnimations(page);
    const stop = page.getByRole("button", { name: "Stoppen", exact: true });
    const box = await stop.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    for (const name of ["Aufgaben ausblenden", "Aufgaben aktualisieren", "Diese Nachricht einreihen",
      "Diese Nachricht als Hintergrundaufgabe starten", "Diese Nachricht als Zwischenauftrag starten"]) {
      const target = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(target, name).not.toBeNull();
      expect(target!.height, name).toBeGreaterThanOrEqual(44);
      expect(target!.width, name).toBeGreaterThanOrEqual(44);
    }
    await expect(input(page)).toBeInViewport();
    expect(await input(page).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await clickVisible(page, stop);
    await expect.poll(() => gateway.calls.filter((call) => call.op === "session.stop").length).toBe(1);
  });
}

test("erhält bei 390×500 echte Freigabe und Stop neben Aufgaben und zehn Anhängen", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  gateway.work.seedSubagent(sessionId, "short-child", { goal: "Eigene kurze Bildschirmprüfung", status: "running" });
  openApproval(gateway);
  await openWork(page);
  await fileInput(page).setInputFiles(Array.from({ length: 10 }, (_, index) => ({
    name: `eigene-datei-${index}.txt`, mimeType: "text/plain", buffer: Buffer.from("Eigener Inhalt"),
  })));
  await expect(page.locator('[data-upload-status="ready"]')).toHaveCount(10);
  const stop = page.getByRole("button", { name: "Stoppen", exact: true });
  await settleAnimations(page);
  const box = await stop.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(500);
  const deck = page.getByRole("region", { name: "Offene Anfragen von Hermes", exact: true });
  const deckBox = await deck.boundingBox();
  expect(deckBox!.height).toBeGreaterThanOrEqual(44);
  // aria-expanded reicht nicht, wenn die offene Region im Elternclip verschwindet.
  const regionHeight = await workRegion(page).evaluate((element) => {
    let { top, bottom } = element.getBoundingClientRect();
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
      const bounds = parent.getBoundingClientRect();
      top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
    }
    return Math.max(0, Math.min(bottom, innerHeight) - Math.max(top, 0));
  });
  expect(regionHeight).toBeGreaterThanOrEqual(44);
  const approve = page.getByRole("button", { name: "Einmal erlauben", exact: true });
  await clickVisible(page, approve);
  await expect.poll(() => gateway.calls.filter((call) => call.op === "request.respond").length).toBe(1);
  await clickVisible(page, stop);
  await expect.poll(() => gateway.calls.filter((call) => call.op === "session.stop").length).toBe(1);
});

test("öffnet eigene Details und führt einen gezielten Kindstop über die Tastatur aus", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  gateway.work.seedSubagent(sessionId, "keyboard-child", { goal: "Eigener Tastaturtest", status: "running" });
  await page.goto(`/wrapt/hermes-v2/standalone?session=${sessionId}`);
  const toggle = page.getByRole("button", { name: "Aufgaben anzeigen", exact: true });
  await toggle.focus();
  await toggle.press("Enter");
  await expect(workRegion(page)).toBeVisible();
  const row = workRow(page, "subagent", "Eigener Tastaturtest");
  const summary = row.locator(":scope > .hermesv2-work-summary");
  await summary.focus();
  await summary.press("Enter");
  const interrupt = row.getByRole("button", { name: /Unteraufgabe unterbrechen:/ });
  await interrupt.focus();
  await interrupt.press("Enter");
  await expect.poll(() => gateway.work.observations.filter((call) => call.op === "work.subagent.interrupt").length).toBe(1);
  await expect(row).toContainText(/unterbrochen/i);
});

test("verwendet bei zwanzig weiteren arbeitenden Sitzungen nur das ausgewählte Chatabo", async ({ page, gateway }) => {
  for (let index = 0; index < 20; index++) {
    const snapshot = gateway.seed(`working-summary-${index}`, `Eigene arbeitende Sitzung ${index}`);
    snapshot.running = snapshot.session.running = true;
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWork(page);
  await expect.poll(() => gateway.calls.filter((call) => call.op === "work.read").length).toBeGreaterThan(0);
  expect(gateway.calls.filter((call) => call.op === "session.subscribe")).toEqual([{ op: "session.subscribe", sessionId }]);
  expect(gateway.calls.filter((call) => call.op === "work.read").every((call) => call.sessionId === sessionId)).toBe(true);
  expect(gateway.viewers.size).toBe(1);
});
