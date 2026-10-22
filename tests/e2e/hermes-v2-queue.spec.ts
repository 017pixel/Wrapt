import { expect } from "@playwright/test";
import { workTest as test, prepareWork, openWork, workRegion, workAction, sessionId,
  composerInput as input, runWorkAction, workMenuItem } from "./hermes-v2-work-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => {
  prepareWork(gateway, true);
  // Die Aufgabenansicht erscheint nur mit mindestens einer belegten Zeile.
  gateway.work.seedSubagent(sessionId, "queue-main-turn", { goal: "Eigene laufende Aufgabe", status: "running" });
});

test("reiht zwei Nachrichten ein und erhält den tatsächlich ersten nativen Kopf", async ({ page, gateway }) => {
  await openWork(page);
  const head = page.getByRole("status", { name: "Nächste eingereihte Nachricht", exact: true });
  await input(page).fill("Erste eigene Folgenachricht");
  await runWorkAction(page, "Einreihen");
  await expect(input(page)).toHaveValue("");
  await expect(head).toContainText("Erste eigene Folgenachricht");
  await input(page).fill("Zweite eigene Folgenachricht");
  await expect(await workMenuItem(page, "Einreihen")).toBeEnabled();
  await runWorkAction(page, "Einreihen");
  await expect(input(page)).toHaveValue("");
  await expect(workAction(page, "queue")).toHaveCount(2);
  await expect(head).toContainText("Erste eigene Folgenachricht");
  await expect(head).not.toContainText("Zweite eigene Folgenachricht");
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toEqual([
    { op: "message.submit", sessionId, mode: "queue" }, { op: "message.submit", sessionId, mode: "queue" },
  ]);
  const occurrences = await page.locator(".hermesv2-chat-body").evaluate((element) =>
    element.textContent!.split("Erste eigene Folgenachricht").length - 1);
  expect(occurrences).toBe(1);
  gateway.work.queueHead(sessionId, "Zweite eigene Folgenachricht");
  await expect(head).toContainText("Zweite eigene Folgenachricht");
  await expect(head).not.toContainText("Erste eigene Folgenachricht");
});

test("erhält Stop während einer ausstehenden Queuequittung", async ({ page, gateway }) => {
  gateway.holdSubmitResults = true;
  await openWork(page);
  await input(page).fill("Eigener ausstehender Folgeauftrag");
  await runWorkAction(page, "Einreihen");
  await expect(workAction(page, "queue")).toContainText(/läuft|ausstehend/i);
  const stop = page.getByRole("button", { name: "Stoppen", exact: true });
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect.poll(() => gateway.calls.filter((call) => call.op === "session.stop").length).toBe(1);
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(1);
  gateway.finishSubmitResults();
});

for (const [status, label] of [
  ["queued", /Steuerung ist eingereiht/i], ["redirected", /Turn wurde umgelenkt/i],
  ["rejected", /Steuerung wurde abgelehnt/i],
] as const) {
  test(`zeigt das echte Steerresultat ${status}`, async ({ page, gateway }) => {
    gateway.steerStatus = status;
    await openWork(page);
    const text = "Eigene konkrete Steuerung";
    await input(page).fill(text);
    await runWorkAction(page, "Steuern");
    await expect(workAction(page, "steer")).toContainText(label);
    expect(gateway.calls.filter((call) => call.op === "session.steer")).toHaveLength(1);
    expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(0);
    if (status === "rejected") await expect(input(page)).toHaveValue(text);
  });
}

test("bereitet queue und steer aus der Palette bewusst vor und sendet keine rohe Slashzeile", async ({ page, gateway }) => {
  await openWork(page);
  await input(page).fill("/queue Eigene Slashfolge");
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(0);
  await input(page).press("Enter");
  await expect(input(page)).toHaveValue("Eigene Slashfolge");
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(0);
  await runWorkAction(page, "Einreihen");
  await expect(workAction(page, "queue")).toContainText(/eingereiht/i);
  await input(page).fill("/steer Eigene Slashsteuerung");
  await input(page).press("Enter");
  await expect(input(page)).toHaveValue("Eigene Slashsteuerung");
  expect(gateway.calls.filter((call) => call.op === "session.steer")).toHaveLength(0);
  await runWorkAction(page, "Steuern");
  await expect(workAction(page, "steer")).toContainText(/eingereiht/i);
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(1);
});

test("wiederholt bei verlorener Queuequittung auch nach Reconnect nicht automatisch", async ({ page, gateway }) => {
  gateway.loseNextSubmitResult = true;
  await openWork(page);
  await input(page).fill("Eigene Queue mit unklarem Ausgang");
  await runWorkAction(page, "Einreihen");
  await expect(page.getByRole("button", { name: "Abgleichen", exact: true })).toBeVisible();
  await expect.poll(() => gateway.calls.filter((call) => call.op === "session.subscribe").length).toBeGreaterThanOrEqual(2);
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(1);
  expect(gateway.stories.get(sessionId)!.snapshot.queuedText).toBe("Eigene Queue mit unklarem Ausgang");
});

test("erhält Completion vor Startquittung und lässt den Hauptturn weiterlaufen", async ({ page, gateway }) => {
  gateway.work.completeBeforeReceipt = true;
  gateway.work.holdActions = true;
  await openWork(page);
  await input(page).fill("Eigene schnelle Nebenfrage");
  await runWorkAction(page, "Zwischenauftrag");
  const task = page.locator('[data-hermes-work-kind="btw"]');
  await expect(task).toContainText(/fertig|abgeschlossen/i);
  gateway.work.finishActions();
  await expect(workAction(page, "btw")).toContainText(/bestätigt/i);
  await expect(task).toContainText(/fertig|abgeschlossen/i);
  await expect(task).not.toContainText(/läuft/i);
  await expect(page.getByRole("button", { name: "Stoppen", exact: true })).toBeEnabled();
  expect(gateway.work.observations.filter((call) => call.op === "work.btw")).toHaveLength(1);
});

test("startet einen konkreten Hintergrundauftrag ohne erfundenen Hauptturn", async ({ page, gateway }) => {
  const snapshot = gateway.stories.get(sessionId)!.snapshot;
  snapshot.running = snapshot.session.running = false;
  snapshot.inflight = null;
  await openWork(page);
  await input(page).fill("Eigener Hintergrundauftrag");
  await runWorkAction(page, "Hintergrund");
  const task = page.locator('[data-hermes-work-kind="background"]');
  await expect(task).toContainText(/läuft/i);
  await expect(workAction(page, "background")).toContainText(/bestätigt/i);
  await expect(page.getByRole("button", { name: "Stoppen", exact: true })).toHaveCount(0);
  expect(snapshot.running).toBe(false);
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(0);
  const id = gateway.work.roster(sessionId).tasks[0]!.id;
  gateway.work.completeTask(sessionId, "background", id);
  await expect(task).toContainText(/fertig|abgeschlossen/i);
});

test("behält unbekannten Nebenauftragsausgang bei bewusstem Read ohne neuen Start", async ({ page, gateway }) => {
  gateway.work.failNextAction = "unknown";
  await openWork(page);
  await input(page).fill("Eigener unbekannter Zwischenauftrag");
  await runWorkAction(page, "Zwischenauftrag");
  await expect(workAction(page, "btw")).toContainText(/Ausgang unklar|unbekannt/i);
  await page.getByRole("button", { name: "Aufgaben aktualisieren", exact: true }).click();
  await expect(workRegion(page)).toContainText(/Teilabdeckung/i);
  expect(gateway.calls.filter((call) => call.op === "work.btw")).toHaveLength(1);
  await expect(workAction(page, "btw")).toContainText(/Ausgang unklar|unbekannt/i);
});

test("erhält den Entwurf bei nachweislich ungesendetem Nebenauftrag", async ({ page, gateway }) => {
  gateway.work.failNextAction = "not_sent";
  await openWork(page);
  const text = "Eigener ungesendeter Hintergrundauftrag";
  await input(page).fill(text);
  await runWorkAction(page, "Hintergrund");
  await expect(workAction(page, "background")).toContainText(/nicht gesendet/i);
  await expect(input(page)).toHaveValue(text);
  expect(gateway.work.roster(sessionId).tasks).toHaveLength(0);
});
