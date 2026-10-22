import { expect } from "@playwright/test";
import { workTest as test, prepareWork, sessionId, settleAnimations } from "./hermes-v2-work-fixture";
import { fileInput } from "./hermes-v2-composer-fixture";
import { openApproval } from "./hermes-v2-request-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 390, height: 500 } });
test.beforeEach(({ gateway }) => prepareWork(gateway, true));

for (const variant of ["route", "standalone"] as const) {
  test(`${variant} zeigt Stop vollständig, bevor eine offene Freigabe beantwortet wird`, async ({ page, gateway }) => {
    const session = gateway.stories.get(sessionId)!.snapshot.session;
    session.cwd = "/eigene/projekte/kurzer-kontext";
    session.projectId = null;
    session.source = "web";
    gateway.work.seedSubagent(sessionId, "short-stop-child", { goal: "Eigene kurze Bildschirmprüfung", status: "running" });
    openApproval(gateway);
    const path = variant === "standalone" ? "/wrapt/hermes-v2/standalone" : "/wrapt/hermes-v2";
    await page.goto(`${path}?session=${sessionId}`);
    await page.getByRole("button", { name: "Aufgaben anzeigen", exact: true }).click();
    await fileInput(page).setInputFiles(Array.from({ length: 10 }, (_, index) => ({
      name: `eigene-stop-datei-${index}.txt`, mimeType: "text/plain", buffer: Buffer.from("Eigene Testdaten"),
    })));
    await expect(page.locator('[data-upload-status="ready"]')).toHaveCount(10);
    await settleAnimations(page);
    const stop = page.getByRole("button", { name: "Stoppen", exact: true });
    // Vor click/scrollIntoView messen: solche Hilfen verbergen den ursprünglichen Clipfehler.
    const hit = await stop.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      let top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
        const clip = parent.getBoundingClientRect();
        top = Math.max(top, clip.top);
        bottom = Math.min(bottom, clip.bottom);
      }
      const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return { height: bounds.height, width: bounds.width, visibleHeight: Math.max(0, bottom - top),
        centerHit: target === element || Boolean(target && element.contains(target)) };
    });
    expect(hit.height).toBeGreaterThanOrEqual(44);
    expect(hit.width).toBeGreaterThanOrEqual(44);
    expect(hit.visibleHeight).toBeGreaterThanOrEqual(44);
    expect(hit.centerHit).toBe(true);
    expect(gateway.calls.filter((call) => call.op === "request.respond")).toHaveLength(0);
    await stop.click();
    await expect.poll(() => gateway.calls.filter((call) => call.op === "session.stop").length).toBe(1);
    expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(0);
  });
}
