import { expect, test as base, type Locator } from "@playwright/test";
import { HermesV2BrowserGateway } from "./hermes-v2-gateway";

const sessionId = "eigene-ausgabe-layoutpruefung";
const output = `${"Vollständige eigene Werkzeugzeile.\n".repeat(5000)}ENDE_EIGENER_AUSGABE`;
const test = base.extend<{ gateway: HermesV2BrowserGateway }>({
  gateway: async ({ context }, use) => {
    const gateway = new HermesV2BrowserGateway();
    gateway.seed(sessionId);
    gateway.seedHistory(sessionId, 2);
    const story = gateway.stories.get(sessionId)!;
    story.history[0] = {
      ...story.history[0]!, role: "assistant",
      text: "```ts\nconst ergebnis = 42;\n```", reasoning: "Tatsächlich gelieferte eigene Begründung.",
    };
    story.history[1] = {
      ...story.history[1]!, role: "tool", text: output, toolId: "eigene-grosse-ausgabe",
      toolName: "Eigene große Werkzeugausgabe", toolStatus: "complete", input: "Eigene Eingabe",
    };
    story.snapshot.messages = [...story.history];
    await gateway.install(context);
    await context.addInitScript(() => localStorage.setItem("wrapt.app-preferences.v1",
      JSON.stringify({ version: 2, state: { defaultPage: "dashboard", hermesV2Enabled: true } })));
    try { await use(gateway); }
    finally { gateway.dispose(); }
  },
});

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

async function expectFullTarget(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, clip.left); right = Math.min(right, clip.right);
      }
    }
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { width: right - left, height: bottom - top, hit: hit !== null && element.contains(hit) };
  });
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.hit).toBe(true);
}

for (const [width, height] of [[1280, 720], [390, 500]] as const) {
  test(`begrenzt große Werkzeugausgaben bei ${width}×${height} ohne Textverlust`, async ({ page, gateway }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/wrapt/hermes-v2/standalone?session=${sessionId}`);
    const card = page.locator(".hermesv2-tool").filter({ hasText: "Eigene große Werkzeugausgabe" });
    await card.locator("summary").click();
    const text = card.locator(".is-output code");
    await expect(text).toHaveText(output);
    const handle = await text.evaluateHandle((element) => {
      const card = element.closest(".hermesv2-tool");
      for (let node: Element | null = element; node && node !== card; node = node.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)
          && node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 100
          && node.getBoundingClientRect().height < innerHeight - 44) return node;
      }
      return null;
    });
    const scroll = handle.asElement();
    expect(scroll, "Begrenzter lokaler Scrollbereich innerhalb der Werkzeugkarte").not.toBeNull();
    await scroll!.hover();
    const before = await scroll!.evaluate((element) => element.scrollTop);
    await page.mouse.wheel(0, 160);
    await expect.poll(() => scroll!.evaluate((element) => element.scrollTop)).toBeGreaterThan(before);
    await scroll!.focus();
    await scroll!.press("Control+End");
    await expect.poll(() => scroll!.evaluate((element) =>
      element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(48);
    await expect(text).toHaveText(output);
    expect(gateway.calls.some((call) => ["message.submit", "session.stop", "request.respond"].includes(call.op))).toBe(false);
    await handle.dispose();
  });
}

for (const [width, height] of [[1280, 720], [390, 844]] as const) {
  test(`erhält volle Kopier- und Aufklappziele bei ${width}×${height}`, async ({ page, gateway }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/wrapt/hermes-v2/standalone?session=${sessionId}`);
    const tool = page.locator(".hermesv2-tool > summary");
    const reasoning = page.locator(".hermesv2-reasoning > summary");
    const copy = page.getByRole("button", { name: "Nachricht kopieren", exact: true });
    const codeCopy = page.getByRole("button", { name: "Code kopieren", exact: true });
    for (const target of [tool, reasoning, copy, codeCopy]) await expectFullTarget(target);
    const separated = await codeCopy.evaluate((button) => {
      const code = button.closest("pre")?.querySelector("code");
      return !!code && code.getBoundingClientRect().top >= button.getBoundingClientRect().bottom;
    });
    expect(separated, "Kopierknopf verdeckt den einzeiligen Code nicht").toBe(true);
    expect(gateway.calls.some((call) => ["message.submit", "session.stop", "request.respond"].includes(call.op))).toBe(false);
  });
}
