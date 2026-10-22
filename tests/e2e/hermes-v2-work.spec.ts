import { expect } from "@playwright/test";
import { workTest as test, prepareWork, openWork, workRegion, workRow, workAction,
  sessionId } from "./hermes-v2-work-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareWork(gateway, true));

test("blendet die Aufgabenansicht ohne belegte Zeilen aus, ohne den Hauptstop zu sperren", async ({ page, gateway }) => {
  await page.goto(`/wrapt/hermes-v2/standalone?session=${sessionId}`);
  await expect(page.getByRole("textbox", { name: "Nachricht an Hermes" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Aufgaben anzeigen", exact: true })).toHaveCount(0);
  await expect(workRegion(page)).toHaveCount(0);
  expect(gateway.work.observations).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Stoppen", exact: true })).toBeEnabled();
});

test("erhält Goal und Modell bei strukturierten Teilpatches und beendet keinen Hauptturn", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "tree-parent", { goal: "Eigene Analyse", status: "running", depth: 0 });
  gateway.work.seedSubagent(sessionId, "tree-child", { goal: "Quelldateien prüfen", model: "echtes-testmodell",
    parentId: "tree-parent", depth: 1, status: "running", startedAt: Date.now() - 5_000 });
  await openWork(page);
  await workRow(page, "subagent", "Eigene Analyse").locator(":scope > .hermesv2-work-summary").click();
  const row = workRow(page, "subagent", "Quelldateien prüfen");
  await row.locator(":scope > .hermesv2-work-summary").click();
  await expect(row).toContainText("echtes-testmodell");
  gateway.work.patch(sessionId, { kind: "subagent", id: "tree-child", toolCount: 3, lastTool: "read_file" });
  await expect(row).toContainText("read_file");
  await expect(row).toContainText("Quelldateien prüfen");
  await expect(row).toContainText("echtes-testmodell");
  gateway.work.patch(sessionId, { kind: "subagent", id: "tree-child", status: "completed" });
  await expect(row).toContainText(/fertig|abgeschlossen/i);
  await expect(page.getByRole("button", { name: "Stoppen", exact: true })).toBeEnabled();
  expect(gateway.calls.filter((call) => call.op === "session.stop")).toHaveLength(0);
});

test("stellt Elternzyklen und gleiche Delegationskennungen ohne verlorene Zeilen dar", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "same-id", { goal: "Kind im Elternzyklus", parentId: "cycle-parent", depth: 1, status: "running" });
  gateway.work.seedSubagent(sessionId, "cycle-parent", { goal: "Zyklischer Elternknoten", parentId: "same-id", depth: 1, status: "running" });
  gateway.work.seedDelegation(sessionId, "same-id", 0, { goal: "Gescheiterter Auftrag null" });
  gateway.work.seedDelegation(sessionId, "same-id", 1, { goal: "Gescheiterter Auftrag eins" });
  await openWork(page);
  await expect(page.locator('[data-hermes-work-kind="subagent"]')).toHaveCount(2);
  await expect(page.locator('[data-hermes-work-kind="delegation"]')).toHaveCount(2);
  const keys = await page.locator("[data-hermes-work-key]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-hermes-work-key")));
  expect(new Set(keys).size).toBe(4);
  expect(gateway.work.observations).toHaveLength(0);
});

test("zeigt found=false und sperrt nur den eigenen ausstehenden Kindstop", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "own-controlled-child", { goal: "Gezielt unterbrechen", status: "running" });
  gateway.work.interruptFound = false;
  gateway.work.holdActions = true;
  await openWork(page);
  const row = workRow(page, "subagent", "Gezielt unterbrechen");
  await row.locator(":scope > .hermesv2-work-summary").click();
  const stop = row.getByRole("button", { name: /Unteraufgabe unterbrechen:/ });
  await stop.click();
  await expect(stop).toBeDisabled();
  await expect.poll(() => gateway.work.observations.length).toBe(1);
  expect(gateway.work.observations[0]).toMatchObject({ op: "work.subagent.interrupt", target: "own-controlled-child" });
  await expect(page.getByRole("button", { name: "Stoppen", exact: true })).toBeEnabled();
  gateway.work.finishActions();
  await expect(workAction(page, "subagent.interrupt")).toContainText(/nicht mehr belegt|nicht.*gefunden/i);
  expect(gateway.calls.filter((call) => call.op === "session.stop")).toHaveLength(0);
});

test("liest Tail nur bewusst und zeigt fehlende sowie gekürzte Textausgabe ohne HTMLausführung", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "tail-child", { goal: "Ausgabe prüfen", status: "running" });
  gateway.work.tail = { available: false, text: "", truncated: false };
  await openWork(page);
  const row = workRow(page, "subagent", "Ausgabe prüfen");
  await row.locator(":scope > .hermesv2-work-summary").click();
  expect(gateway.work.observations).toHaveLength(0);
  const read = row.getByRole("button", { name: /Unteraufgabe-Ausgabe lesen:/ });
  await read.click();
  await expect(workAction(page, "subagent.tail")).toContainText(/keine Ausgabe/i);
  const output = '<img src=x onerror="window.__hermesWorkInjected=1">Eigene Ausgabe';
  gateway.work.tail = { available: true, text: output, truncated: true };
  await read.click();
  await expect(workAction(page, "subagent.tail").last()).toContainText(/gekürzt/i);
  await expect(row).toContainText(output);
  expect(await page.evaluate(() => Reflect.get(window, "__hermesWorkInjected"))).toBeUndefined();
  expect(gateway.work.observations.filter((call) => call.op === "work.subagent.tail")).toHaveLength(2);
});

for (const [status, label] of [
  ["already_exited", /bereits beendet/i], ["not_found", /nicht mehr belegt|nicht.*gefunden/i],
  ["error", /konnte nicht beendet|Prozessfehler/i],
] as const) {
  test(`erhält natives Prozessresultat ${status} und die eigene Prozesskennung`, async ({ page, gateway }) => {
    gateway.work.seedProcess(sessionId, "own-process-not-chat", { command: "Eigener Prüfprozess" });
    gateway.work.killStatus = status;
    await openWork(page);
    const row = workRow(page, "process", "Eigener Prüfprozess");
    await row.locator(":scope > .hermesv2-work-summary").click();
    await row.getByRole("button", { name: /Prozess beenden:/ }).click();
    await expect(workAction(page, "process.kill")).toContainText(label);
    expect(gateway.work.observations).toContainEqual({ op: "work.process.kill", sessionId, target: "own-process-not-chat" });
    expect(gateway.calls.filter((call) => call.op === "session.stop")).toHaveLength(0);
  });
}

test("hält den Hauptstop während einer ausstehenden Kindantwort erreichbar", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "pending-child", { goal: "Ausstehende Kindantwort", status: "running" });
  gateway.work.holdActions = true;
  await openWork(page);
  const row = workRow(page, "subagent", "Ausstehende Kindantwort");
  await row.locator(":scope > .hermesv2-work-summary").click();
  await row.getByRole("button", { name: /Unteraufgabe unterbrechen:/ }).click();
  const stop = page.getByRole("button", { name: "Stoppen", exact: true });
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect.poll(() => gateway.calls.filter((call) => call.op === "session.stop").length).toBe(1);
  expect(gateway.work.observations.filter((call) => call.op === "work.subagent.interrupt")).toHaveLength(1);
  gateway.work.finishActions();
});

test("erzeugt bei Tokenfortschritt weder Rosterpolling noch zusätzliche Chatabos", async ({ page, gateway }) => {
  gateway.work.seedSubagent(sessionId, "token-progress", { goal: "Eigene Fortschrittsaufgabe", status: "running" });
  await openWork(page);
  await expect.poll(() => gateway.calls.filter((call) => call.op === "work.read").length).toBeGreaterThan(0);
  const initial = gateway.calls.filter((call) => call.op === "work.read").length;
  for (let index = 0; index < 40; index++) gateway.delta(sessionId, "x");
  await expect(page.locator(".hermesv2-messages")).toContainText("xxxxxxxx");
  expect(gateway.calls.filter((call) => call.op === "work.read")).toHaveLength(initial);
  expect(gateway.calls.filter((call) => call.op === "session.subscribe")).toHaveLength(1);
});
