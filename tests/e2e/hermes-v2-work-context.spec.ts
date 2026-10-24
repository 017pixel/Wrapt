import { expect } from "@playwright/test";
import { workTest as test, prepareWork, openWork, workRegion, workRow, sessionId,
  otherId, workAction, runWorkAction, composerInput } from "./hermes-v2-work-fixture";
import type { HermesV2BrowserGateway } from "./hermes-v2-gateway";
import { waitForHermesV2 } from "./helpers/hermes-v2-settings";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareWork(gateway, true));

async function select(page: Parameters<typeof openWork>[0], id: string) {
  await page.locator(`[data-session-id="${id}"] .hermesv2-rowselect`).click();
  await expect(page).toHaveURL(new RegExp(`session=${id}`));
}

async function showWork(page: Parameters<typeof openWork>[0]) {
  const toggle = page.getByRole("button", { name: "Aufgaben anzeigen", exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await expect(workRegion(page)).toBeVisible();
}

function updateCwd(gateway: HermesV2BrowserGateway, cwd: string) {
  const snapshot = gateway.stories.get(sessionId)!.snapshot;
  snapshot.session.cwd = cwd;
  gateway.emit(sessionId, "session.updated", { session: { ...snapshot.session },
    selection: snapshot.selection, turnStartedAt: snapshot.turnStartedAt,
    ...(snapshot.composer ? { composer: snapshot.composer } : {}) });
}

test("verwirft einen alten Rosterread über A-B-A und zeigt den frischen Stand", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "context-child", { goal: "Veralteter Rostertext", status: "running" });
  await openWork(page);
  gateway.work.holdReads = true;
  await expect.poll(() => gateway.calls.filter((call) => call.op === "work.read").length).toBeGreaterThan(0);
  await select(page, otherId);
  await select(page, sessionId);
  gateway.work.patch(sessionId, { kind: "subagent", id: "context-child", goal: "Frischer Rostertext", status: "running" });
  gateway.work.holdReads = false;
  gateway.work.finishReads();
  await showWork(page);
  await expect(workRow(page, "subagent", "Frischer Rostertext")).toBeVisible();
  await expect(workRegion(page)).not.toContainText("Veralteter Rostertext");
  await expect(page.getByRole("button", { name: "Aufgaben aktualisieren", exact: true })).toBeEnabled();
});

test("zeigt keine alte Tailantwort nach Wechsel und Rückkehr zur gleichen Sitzung", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "context-tail", { goal: "Eigener Ausgabewechsel", status: "running" });
  gateway.work.tail = { available: true, text: "Veraltete eigene Tailantwort", truncated: false };
  gateway.work.holdActions = true;
  await openWork(page);
  const row = workRow(page, "subagent", "Eigener Ausgabewechsel");
  await row.locator(":scope > .hermesv2-work-summary").click();
  await row.getByRole("button", { name: /Unteraufgabe-Ausgabe lesen:/ }).click();
  await expect.poll(() => gateway.work.observations.length).toBe(1);
  await select(page, otherId);
  await select(page, sessionId);
  gateway.work.finishActions();
  await showWork(page);
  await expect(workRegion(page)).not.toContainText("Veraltete eigene Tailantwort");
  expect(gateway.work.observations).toHaveLength(1);
});

test("beendet bei ausgeschaltetem Flag zusätzlichen Worktraffic ohne Hauptstop", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "flag-context", { goal: "Eigene Flagprüfung", status: "running" });
  await openWork(page);
  await page.goto("/wrapt/settings#einstellungen:experimente");
  const toggle = page.getByRole("switch", { name: /Hermes V2 aktivieren/ });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await waitForHermesV2(page, false);
  await expect.poll(() => gateway.viewers.size).toBe(0);
  const before = gateway.calls.length;
  gateway.work.invalidate(sessionId);
  gateway.work.patch(sessionId, { kind: "subagent", id: "late-disabled-child", status: "running" });
  expect(gateway.calls).toHaveLength(before);
  expect(gateway.calls.filter((call) => call.op === "session.stop")).toHaveLength(0);
});

test("verwirft eine alte Tailantwort nach beobachtetem Live-CWD-A-B-A", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "cwd-tail", { goal: "Eigene Liveprojektprüfung", status: "running" });
  gateway.work.tail = { available: true, text: "Überholte Ausgabe aus altem Projektkontext", truncated: false };
  gateway.work.holdActions = true;
  await openWork(page);
  const row = workRow(page, "subagent", "Eigene Liveprojektprüfung");
  await row.locator(":scope > .hermesv2-work-summary").click();
  await row.getByRole("button", { name: /Unteraufgabe-Ausgabe lesen:/ }).click();
  await expect.poll(() => gateway.work.observations.length).toBe(1);
  const original = gateway.stories.get(sessionId)!.snapshot.session.cwd!;
  updateCwd(gateway, "/anderes-synthetisches-projekt");
  updateCwd(gateway, original);
  gateway.work.finishActions();
  await expect(workAction(page, "subagent.tail")).toContainText(/Ausgang unklar|nicht gesendet/i);
  await expect(page.locator(".hermesv2-chat-body")).not.toContainText("Überholte Ausgabe aus altem Projektkontext");
  expect(gateway.work.observations).toHaveLength(1);
});

test("beendet Queuepending bei Livekontextverlust und nimmt einen neuen bewussten Klick an", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "queue-context", { goal: "Eigene Kontextprüfung", status: "running" });
  gateway.holdSubmitResults = true;
  await openWork(page);
  const text = "Eigene bewusst wieder gewählte Folgenachricht";
  await composerInput(page).fill(text);
  await runWorkAction(page, "Einreihen");
  await expect.poll(() => gateway.calls.filter((call) => call.op === "message.submit").length).toBe(1);
  updateCwd(gateway, "/anderes-synthetisches-projekt");
  gateway.finishSubmitResults();
  await expect(workAction(page, "queue")).toContainText(/Ausgang unklar/i);
  gateway.holdSubmitResults = false;
  await composerInput(page).fill(text);
  await runWorkAction(page, "Einreihen");
  await expect.poll(() => gateway.calls.filter((call) => call.op === "message.submit").length).toBe(2);
  await expect(workAction(page, "queue").last()).toContainText(/bestätigt/i);
});
