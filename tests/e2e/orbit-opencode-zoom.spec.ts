import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";
import { resetOrbitTestWorkspace } from "./helpers/orbit";

const origin = process.env.WRAPT_E2E_URL ?? "http://127.0.0.1:3010";
const login = "user@example.com";
const headers = apiIdentityHeaders(login);

test.use({ extraHTTPHeaders: headers, viewport: { width: 1440, height: 960 }, serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.WRAPT_E2E_URL, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await resetOrbitTestWorkspace(page, login);
});

test.afterEach(async ({ page }) => {
  if (!process.env.WRAPT_E2E_URL) return;
  await resetOrbitTestWorkspace(page, login);
});

test("behält den OpenCode-iframe-Inhalt bei Orbit-Zoom ohne iframe- oder Browserzoom-Neustart", async ({ page }) => {
  const orbitUrl = new URL("/api/v1/orbit", origin).toString();
  const current = await (await page.request.get(orbitUrl, { headers })).json() as { revision: number };
  const boardId = `opencode-zoom-${Date.now()}`;
  const saved = await page.request.put(orbitUrl, {
    headers,
    data: {
      expectedRevision: current.revision,
      document: {
        version: 8,
        activeBoardId: boardId,
        focusedNodeId: null,
        boards: [{
          id: boardId,
          name: "OpenCode-Zoomprüfung",
          viewport: { x: 0, y: 0, zoom: 1 },
          worldBounds: { minX: -1_000, minY: -800, maxX: 3_000, maxY: 2_000 },
          nodes: [{
            id: "opencode-zoom-node",
            type: "tool",
            title: "OpenCode",
            position: { x: 100, y: 100 },
            size: { width: 680, height: 480 },
            projectId: null,
            parentId: null,
            runtimeId: null,
            toolType: "opencode",
            previewId: null,
            provider: null,
            content: "",
            language: null,
            locked: false,
            zIndex: 1,
          }],
          edges: [],
        }],
      },
    },
  });
  await expect(saved).toBeOK();

  let iframeRequests = 0;
  let iframeNavigations = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/opencode") iframeRequests += 1;
  });
  page.on("framenavigated", (frame) => {
    if (frame.parentFrame() === page.mainFrame() && new URL(frame.url()).pathname === "/opencode") iframeNavigations += 1;
  });
  await page.route("**/opencode", (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><button id='change-state'>Zustand ändern</button><output id='state' data-boot-id='opencode-fixture-boot'>0</output><script>document.querySelector('#change-state').addEventListener('click', () => { const state = document.querySelector('#state'); state.textContent = String(Number(state.textContent) + 1); });</script></body></html>",
  }));

  await page.goto(`${origin}/wrapt/orbit`);
  const node = page.locator('.react-flow__node-orbit[data-id="opencode-zoom-node"]');
  const iframe = node.locator('iframe[title="OpenCode"]');
  await expect(iframe).toBeVisible();
  const frame = page.frameLocator('iframe[title="OpenCode"]');
  await frame.getByRole("button", { name: "Zustand ändern" }).click();
  await expect(frame.locator("#state")).toHaveText("1");

  await iframe.evaluate((element) => { element.dataset.zoomCheckFrame = "stable-iframe"; });
  const measure = () => iframe.evaluate((element) => {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport) throw new Error("Orbit-Viewport fehlt.");
    const currentFrame = element as HTMLIFrameElement;
    const child = currentFrame.contentWindow;
    if (!child) throw new Error("OpenCode-Fixture-iframe ist nicht bereit.");
    const bounds = currentFrame.getBoundingClientRect();
    return {
      zoom: new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a,
      browserScale: window.visualViewport?.scale ?? 1,
      browserViewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      frameViewport: {
        width: child.innerWidth,
        height: child.innerHeight,
        dpr: child.devicePixelRatio,
        scale: child.visualViewport?.scale ?? 1,
      },
      frameBox: { width: bounds.width, height: bounds.height },
      frameLayout: { width: currentFrame.offsetWidth, height: currentFrame.offsetHeight },
      frameSrc: currentFrame.getAttribute("src"),
      frameIdentity: currentFrame.dataset.zoomCheckFrame,
      bootId: child.document.querySelector("#state")?.getAttribute("data-boot-id"),
    };
  });
  const initial = await measure();
  expect(initial.frameIdentity).toBe("stable-iframe");
  expect(initial.bootId).toBe("opencode-fixture-boot");

  await page.getByRole("button", { name: "Verkleinern" }).click();
  await expect.poll(async () => (await measure()).zoom).toBeLessThan(initial.zoom);
  const zoomed = await measure();
  await expect.poll(() => iframeRequests).toBe(1);
  expect(zoomed.zoom).toBeLessThan(initial.zoom);
  expect(zoomed.browserScale).toBe(initial.browserScale);
  expect(zoomed.frameBox.width / initial.frameBox.width).toBeCloseTo(zoomed.zoom / initial.zoom, 1);
  expect(zoomed.frameLayout).toEqual(initial.frameLayout);
  expect(zoomed.browserViewport).toEqual(initial.browserViewport);
  expect(zoomed.frameViewport).toEqual(initial.frameViewport);
  expect(zoomed.frameSrc).toBe(initial.frameSrc);
  expect(zoomed.frameIdentity).toBe(initial.frameIdentity);
  expect(zoomed.bootId).toBe(initial.bootId);
  await expect(frame.locator("#state")).toHaveText("1");
  expect(iframeRequests).toBe(1);
  expect(iframeNavigations).toBe(1);

  await page.getByRole("button", { name: "Vergrößern" }).click();
  await expect.poll(async () => (await measure()).zoom).toBeGreaterThan(zoomed.zoom);
  const returned = await measure();
  expect(returned.zoom).toBeGreaterThan(zoomed.zoom);
  expect(returned.frameIdentity).toBe(initial.frameIdentity);
  expect(returned.bootId).toBe(initial.bootId);
  expect(returned.frameViewport).toEqual(initial.frameViewport);
  expect(iframeRequests).toBe(1);
  expect(iframeNavigations).toBe(1);
  await expect(frame.locator("#state")).toHaveText("1");
});
