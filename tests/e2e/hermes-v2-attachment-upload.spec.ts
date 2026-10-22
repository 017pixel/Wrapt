import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { composerTest as test, prepareComposer, openComposer as open, composerInput as input,
  fileInput, uploadCard, mutationCalls as calls, sessionId, otherId } from "./hermes-v2-composer-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1440, height: 900 } });
test.beforeEach(({ gateway }) => prepareComposer(gateway));
const dummy = (name = "testnotiz.txt", size = 24) => ({ name, mimeType: "text/plain", buffer: Buffer.alloc(size, "x") });

test("erhält Stop und die Freigabe bei zehn Anhängen auf einem kurzen Handybildschirm", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  const story = gateway.stories.get(sessionId)!;
  story.turnId = "attachment-layout-turn";
  story.snapshot.running = story.snapshot.session.running = true;
  story.snapshot.turnStartedAt = Date.now();
  gateway.requests.open(sessionId, { kind: "approval", method: "approval", command: "echo eigener-test",
    description: "Freigabe während eigener Uploads", choices: ["once", "deny"] });
  await open(page);
  await fileInput(page).setInputFiles(Array.from({ length: 10 }, (_, index) => dummy(`datei-${index}.txt`)));
  await expect(page.locator('[data-upload-status="ready"]')).toHaveCount(10);
  await expect(page.getByRole("article", { name: "Freigabe angefragt", exact: true })).toBeVisible();
  const deck = await page.getByRole("region", { name: "Offene Anfragen von Hermes", exact: true }).boundingBox();
  expect(deck!.height).toBeGreaterThan(44);
  const stop = page.getByRole("button", { name: "Stoppen", exact: true });
  const stopBox = await stop.boundingBox();
  expect(stopBox!.y + stopBox!.height).toBeLessThanOrEqual(500);
  await stop.click();
  await expect.poll(() => calls(gateway, "session.stop").length).toBe(1);
  expect(calls(gateway, "message.submit")).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("sendet eine große Datei als opaque Referenz und zeigt sie nach Reload an der belegten Userrow", async ({ page, gateway }) => {
  await open(page);
  await fileInput(page).setInputFiles(dummy("grosse-testdatei.txt", 2_097_152));
  await expect(uploadCard(page, "grosse-testdatei.txt")).toHaveAttribute("data-upload-status", "ready");
  const stored = [...gateway.attachments.files.values()][0]!;
  await expect(page.getByRole("button", { name: "Senden", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect.poll(() => calls(gateway, "message.submit").length).toBe(1);
  expect(gateway.attachments.submissions).toEqual([{ sessionId, ids: [stored.attachment.id], wireBytes: expect.any(Number) }]);
  expect(gateway.attachments.submissions[0]!.wireBytes).toBeLessThan(1024);
  await expect(page.locator(`[data-attachment-id="${stored.attachment.id}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-attachment-id="${stored.attachment.id}"]`)).toHaveCount(1);
  expect(calls(gateway, "message.submit")).toHaveLength(1);
});

test("lädt mehrere Dateien nacheinander und sendet ihre IDs in genau einer Nachricht", async ({ page, gateway }) => {
  gateway.attachments.holdUploads = true;
  await open(page);
  await fileInput(page).setInputFiles([dummy("erstes.txt"), dummy("zweites.txt")]);
  await expect.poll(() => gateway.attachments.calls.filter((call) => call.kind === "upload").length).toBe(1);
  await expect(uploadCard(page, "erstes.txt")).toHaveAttribute("data-upload-status", "uploading");
  expect(gateway.attachments.calls.filter((call) => call.kind === "upload")).toHaveLength(1);
  await gateway.attachments.finishPending();
  await expect.poll(() => gateway.attachments.calls.filter((call) => call.kind === "upload").length).toBe(2);
  await gateway.attachments.finishPending();
  await expect(uploadCard(page, "erstes.txt")).toHaveAttribute("data-upload-status", "ready");
  await expect(uploadCard(page, "zweites.txt")).toHaveAttribute("data-upload-status", "ready");
  await input(page).fill("Prüfe die beiden Testdateien");
  await input(page).press("Enter");
  await expect.poll(() => calls(gateway, "message.submit").length).toBe(1);
  expect(gateway.attachments.submissions[0]!.ids).toHaveLength(2);
});

test("entfernt einen fertigen Anhang ausschließlich aus dem lokalen Entwurf", async ({ page, gateway }) => {
  await open(page);
  await fileInput(page).setInputFiles(dummy());
  const card = uploadCard(page, "testnotiz.txt");
  await expect(card).toHaveAttribute("data-upload-status", "ready");
  await card.getByRole("button", { name: /Entfernen|entfernen/ }).click();
  await expect(card).toHaveCount(0);
  expect(gateway.attachments.files.size).toBe(1);
  expect(calls(gateway, "message.submit")).toHaveLength(0);
  expect(gateway.attachments.calls.map((call) => call.kind)).toEqual(["upload"]);
});

test("gleicht eine verlorene Uploadantwort bewusst über dieselbe Upload-ID ab", async ({ page, gateway }) => {
  gateway.attachments.loseNextReply = true;
  await open(page);
  await fileInput(page).setInputFiles(dummy());
  const card = uploadCard(page, "testnotiz.txt");
  await expect(card).toHaveAttribute("data-upload-status", "unknown");
  await expect(page.getByRole("button", { name: "Senden", exact: true })).toBeDisabled();
  expect(gateway.attachments.calls.filter((call) => call.kind === "upload")).toHaveLength(1);
  await card.getByRole("button", { name: /Abgleichen|Status prüfen/i }).click();
  await expect(card).toHaveAttribute("data-upload-status", "ready");
  const uploads = gateway.attachments.calls.filter((call) => call.kind === "upload");
  const statuses = gateway.attachments.calls.filter((call) => call.kind === "status");
  expect(uploads).toHaveLength(1);
  expect(statuses).toEqual([{ kind: "status", uploadId: uploads[0]!.uploadId }]);
  expect(calls(gateway, "message.submit")).toHaveLength(0);
});

test("behält einen unklaren Core-Upload auch nach Statusread unklar und wiederholt ihn nicht", async ({ page, gateway }) => {
  gateway.attachments.unknownNextUpload = true;
  await open(page);
  await fileInput(page).setInputFiles(dummy());
  const card = uploadCard(page, "testnotiz.txt");
  await expect(card).toHaveAttribute("data-upload-status", "unknown");
  await card.getByRole("button", { name: /Abgleichen|Status prüfen/i }).click();
  await expect.poll(() => gateway.attachments.calls.filter((call) => call.kind === "status").length).toBe(1);
  await expect(card).toHaveAttribute("data-upload-status", "unknown");
  expect(gateway.attachments.calls.filter((call) => call.kind === "upload")).toHaveLength(1);
  expect(gateway.attachments.files.size).toBe(0);
});

test("weist eine zu große Datei vor HTTP und ohne geheime Kürzung ab", async ({ page, gateway }) => {
  await open(page);
  await fileInput(page).setInputFiles(dummy("zu-gross.txt", 4_194_305));
  await expect(page.getByText(/zu groß|4\s*MiB|4\s*MB/i).first()).toBeVisible();
  expect(gateway.attachments.calls.filter((call) => call.kind === "upload")).toHaveLength(0);
  expect(calls(gateway, "message.submit")).toHaveLength(0);
});

test("übernimmt einen verspäteten Upload nicht in den Entwurf einer anderen Sitzung", async ({ page, gateway }) => {
  gateway.attachments.holdUploads = true;
  await open(page);
  await fileInput(page).setInputFiles([dummy("alter-upload.txt"), dummy("nicht-in-B.txt")]);
  await expect.poll(() => gateway.attachments.calls.filter((call) => call.kind === "upload").length).toBe(1);
  await page.locator(`[data-session-id="${otherId}"] .hermesv2-rowselect`).click();
  await expect(page).toHaveURL(new RegExp(`session=${otherId}`));
  await input(page).fill("Neuer eigener Entwurf");
  await gateway.attachments.finishPending();
  await expect(uploadCard(page, "alter-upload.txt")).toHaveCount(0);
  await expect(uploadCard(page, "nicht-in-B.txt")).toHaveCount(0);
  await expect(input(page)).toHaveValue("Neuer eigener Entwurf");
  expect(calls(gateway, "message.submit")).toHaveLength(0);
  expect(gateway.attachments.calls.filter((call) => call.kind === "upload")).toHaveLength(1);
});

test("verwendet Datei-Drop über dieselbe abgesicherte Uploadaktion", async ({ page, gateway }) => {
  await open(page);
  await page.locator(".hermesv2-composer").evaluate((node) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["Synthetischer Dateidrop"], "abgelegt.txt", { type: "text/plain" }));
    node.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect(uploadCard(page, "abgelegt.txt")).toHaveAttribute("data-upload-status", "ready");
  expect(gateway.attachments.calls.filter((call) => call.kind === "upload")).toHaveLength(1);
  expect(calls(gateway, "message.submit")).toHaveLength(0);
});

test("öffnet SVG-Anhänge ausschließlich als geschützten Download", async ({ page, gateway }) => {
  await open(page);
  await fileInput(page).setInputFiles({ name: "testbild.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Dummy</text></svg>') });
  await expect(uploadCard(page, "testbild.svg")).toHaveAttribute("data-upload-status", "ready");
  await input(page).fill("Nur als Dateireferenz");
  await input(page).press("Enter");
  const id = [...gateway.attachments.files.keys()][0]!;
  const link = page.locator(`[data-attachment-id="${id}"]`).getByRole("link");
  await expect(link).toHaveAttribute("href", new RegExp(`/api/v1/hermes/v2/attachments/${id}$`));
  await expect(page.locator('img[src^="blob:"],iframe[src*="attachments"],object')).toHaveCount(0);
  const downloaded = page.waitForEvent("download");
  await link.click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("testbild.svg");
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  if (!path) throw new Error("Der eigene Testdownload wurde nicht gespeichert.");
  expect(await readFile(path)).toEqual(gateway.attachments.files.get(id)!.bytes);
  expect(gateway.attachments.calls.filter((call) => call.kind === "download")).toHaveLength(1);
});
