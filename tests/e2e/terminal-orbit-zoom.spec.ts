import { expect, test, type Page } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";
import { enableOrbitInTestBrowser, resetOrbitTestWorkspace } from "./helpers/orbit";
import { resetTerminalTestWorkspace } from "./helpers/terminal";

const origin = process.env.WRAPT_E2E_URL ?? "http://127.0.0.1:3010";
const login = "terminal-orbit-handoff@example.com";
const headers = apiIdentityHeaders(login);

test.use({ extraHTTPHeaders: headers, viewport: { width: 1440, height: 960 } });

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.WRAPT_E2E_URL, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await enableOrbitInTestBrowser(page);
  await resetTerminalTestWorkspace(page, login);
  await resetOrbitTestWorkspace(page, login);
});

test.afterEach(async ({ page }) => {
  if (!process.env.WRAPT_E2E_URL) return;
  await resetOrbitTestWorkspace(page, login);
  await resetTerminalTestWorkspace(page, login);
});

async function fontAndCanvasScale(page: Page) {
  return page.locator(".orbit-live-node .xterm-rows").evaluate((rows) => {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport) throw new Error("Orbit-Canvas-Viewport fehlt.");
    const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
    return { fontSize: Number.parseFloat(getComputedStyle(rows).fontSize), canvasScale: transform.a };
  });
}

test("hält xterm-Schrift im Orbit-Canvas bei Zoomstufen visuell konstant", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${origin}/wrapt/terminal`);
  const emptyState = page.locator(".terminal-empty-state");
  await expect(emptyState).toBeVisible();
  await emptyState.getByRole("button").click();
  await expect(page.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 20_000 });
  const outputMarker = `__ZOOM_RENDER_${Date.now()}__`;
  const standalonePane = page.locator(".terminal-session-pane.is-visible").first();
  const terminalInput = standalonePane.locator(".xterm-helper-textarea");
  await terminalInput.fill("");
  await terminalInput.pressSequentially(`printf '%s\\n' '${outputMarker}'`);
  await terminalInput.press("Enter");
  await expect(standalonePane.locator(".xterm-screen")).toContainText(outputMarker, { timeout: 15_000 });

  await page.getByRole("button", { name: "Weitere Terminalaktionen" }).click();
  await page.getByLabel("Laufende Sessions anzeigen").click();
  await page.getByRole("button", { name: "Session im Orbit öffnen" }).click();
  await expect(page).toHaveURL(/\/wrapt\/orbit$/);
  const rows = page.locator(".orbit-live-node .xterm-rows");
  await expect(rows).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".orbit-live-node .xterm-screen")).toContainText(outputMarker);
  const orbitTerminal = page.locator(".orbit-live-node:has(.terminal-area)").last();
  await expect(orbitTerminal).toHaveCSS("border-left-width", "0px");
  await expect(orbitTerminal).toHaveCSS("border-right-width", "0px");
  await expect(orbitTerminal).toHaveCSS("border-bottom-width", "0px");
  const terminalViewport = orbitTerminal.locator(".terminal-viewport");
  await expect(terminalViewport).toHaveCSS("border-left-width", "0px");
  await expect(terminalViewport).toHaveCSS("border-right-width", "0px");
  await expect(terminalViewport).toHaveCSS("border-bottom-width", "0px");

  const samples = [];
  for (const [button, repetitions] of [["Verkleinern", 2], ["Vergrößern", 4], ["Verkleinern", 2]] as const) {
    for (let index = 0; index < repetitions; index += 1) {
      const before = await fontAndCanvasScale(page);
      await page.getByRole("button", { name: button }).click();
      await expect.poll(async () => (await fontAndCanvasScale(page)).canvasScale).not.toBe(before.canvasScale);
      await expect(page.locator(".orbit-live-node .xterm-screen")).toContainText(outputMarker);
      samples.push(await fontAndCanvasScale(page));
    }
  }

  expect(samples.length).toBe(8);
  for (const sample of samples) {
    expect(sample.canvasScale).toBeGreaterThanOrEqual(0.1);
    expect(sample.fontSize * sample.canvasScale).toBeCloseTo(14, 0);
  }
});
