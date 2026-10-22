import { expect } from "@playwright/test";
import { composerTest as test } from "./hermes-v2-composer-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

for (const standalone of [false, true]) {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    test(`bestätigt die gelesene letzte Antwort nach Scrollen: ${standalone ? "Standalone" : "Route"} ${width}`, async ({ page, gateway }) => {
      const id = "read-position-own";
      gateway.seed(id, "Eigene Lesepositionsprüfung");
      gateway.composer.seed(id);
      gateway.seedHistory(id, 20);
      gateway.stories.get(id)!.turnId = "read-position-own-turn";
      const evidence = gateway.organization.newAnswer(id);
      const text = "Eigene vollständig gelesene letzte Antwort";
      gateway.complete(id, text, "completed", evidence);
      await page.setViewportSize({ width: width!, height: height! });
      await page.goto(`/wrapt/hermes-v2${standalone ? "/standalone" : ""}?session=${id}`);
      const answer = page.getByText(text, { exact: true });
      await answer.scrollIntoViewIfNeeded();
      await expect(answer).toBeInViewport({ ratio: 1 });
      await expect.poll(() => gateway.organization.item(id).attention.unreadCount).toBe(0);
      const readCalls = gateway.organization.calls.filter((call) => call.path === "/organization/read");
      expect(readCalls).toHaveLength(1);
      const marker = page.locator("[data-read-evidence]");
      await expect(marker).toHaveCount(1);
      const position = await marker.evaluate((element) => {
        const markerRect = element.getBoundingClientRect();
        const rowRect = element.closest(".hermesv2-row")!.getBoundingClientRect();
        const chatRect = element.closest(".hermesv2-messages")!.getBoundingClientRect();
        return { insideRow: markerRect.top >= rowRect.top && markerRect.bottom <= rowRect.bottom,
          insideChat: markerRect.top >= chatRect.top && markerRect.bottom <= chatRect.bottom };
      });
      expect(position).toEqual({ insideRow: true, insideChat: true });
      expect(gateway.calls.filter((call) => ["message.submit", "session.create", "session.stop"].includes(call.op))).toHaveLength(0);
    });
  }
}
