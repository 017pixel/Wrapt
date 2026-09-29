import { expect, test, type Page, type Route } from "@playwright/test";
import { enableOrbitInTestBrowser } from "./helpers/orbit";

test.use({ serviceWorkers: "block", extraHTTPHeaders: { "tailscale-user-login": "preview-handoff@example.invalid" } });

const projectId = "preview-e2e";
const sessionId = "6a470857-d019-4a98-a8d3-d9f2a1506e19";
const slotUrl = "https://preview-slot-1.wrapt.test/";

function fixtures() {
  const updatedAt = "2026-09-26T12:00:00.000Z";
  const project = {
    id: projectId, name: "Preview E2E", description: "", path: "/tmp/preview-e2e", enabled: true,
    sortOrder: 0, availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews: [{ id: "frontend", name: "Frontend", url: null, targetPort: 4173, path: "/admin", mode: "embedded", dependencies: [] }],
    links: { t3Code: null, codeServer: null },
  };
  const runtime = {
    projectId, state: "running", command: "pnpm dev", mainPort: 4173, mainServiceId: "frontend", profileSource: "configured",
    services: [{
      id: "frontend", name: "Frontend", role: "frontend", command: "pnpm dev", workingDirectory: "/tmp/preview-e2e",
      port: 4173, portMode: "argument", source: "configured", frameworkHints: [], state: "running", pid: 99,
      startedAt: updatedAt, exitCode: null, message: null,
    }],
    allowedPorts: [4173], warnings: [], publicUrl: null, pid: 99, startedAt: updatedAt, updatedAt, exitCode: null, message: null,
  };
  const board = {
    id: "orbit-preview-test", name: "Testboard", viewport: { x: 0, y: 0, zoom: 0.8 },
    worldBounds: { minX: -1_600, minY: -1_000, maxX: 1_600, maxY: 1_000 }, nodes: [], edges: [],
  };
  return {
    project,
    runtime,
    orbit: {
      document: { version: 8, activeBoardId: board.id, focusedNodeId: null, boards: [board] },
      revision: 0, updatedAt, initialized: true, syncIntervalMilliseconds: 5_000,
    },
    logs: { projectId, output: "", truncated: false, services: [], errorCount: 0, warningCount: 0, capturedAt: updatedAt },
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installPreviewMocks(page: Page) {
  const data = fixtures();
  let orbitResponse = data.orbit;
  const sessions = new Map<string, { id: string; slotId: number; sessionKey: string; projectId: string | null; primaryPort: number; isolate: boolean; storageProfileId: string | null }>();
  const sessionRequests: Array<Record<string, unknown>> = [];

  await page.context().route("https://preview-slot-1.wrapt.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: "<!doctype html><html><head><title>Mock Preview</title></head><body><p>Mock Preview verfügbar</p></body></html>",
  }));
  await page.context().route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = request.method();
    if (path === "/projects" && method === "GET") return json(route, { projects: [data.project], projectsRoot: "/tmp", recentLimit: 8 });
    if (path === "/orbit" && method === "GET") return json(route, orbitResponse);
    if (path === "/orbit" && method === "PUT") {
      const body = request.postDataJSON() as { document: typeof data.orbit.document };
      orbitResponse = { ...orbitResponse, document: body.document, revision: orbitResponse.revision + 1, updatedAt: new Date().toISOString() };
      return json(route, orbitResponse);
    }
    if ((path === "/previews/dev-servers" || path === `/previews/dev-servers/${projectId}`) && method === "GET") {
      return json(route, path === "/previews/dev-servers" ? { runtimes: [data.runtime] } : data.runtime);
    }
    if (path === `/previews/dev-servers/${projectId}/logs` && method === "GET") return json(route, data.logs);
    if (path === "/previews/device-preference" && method === "GET") return json(route, { deviceId: "iphone-13", orientation: "portrait", updatedAt: null });
    if (path === "/previews/service-candidates" && url.searchParams.get("projectId") === projectId && method === "GET") return json(route, { projectId, candidates: [], scannedAt: data.runtime.updatedAt });
    if (path === `/previews/service-graphs/${projectId}/4173` && method === "GET") return json(route, {
      graph: { projectId, primaryServiceId: "4173", edges: [], updatedAt: null },
      capacity: { requiredSlots: 1, reusableSlots: 0, freeSlots: 8, totalSlots: 8, fits: true, limitations: [] },
    });
    if (path === "/previews/sessions" && method === "POST") {
      const body = request.postDataJSON() as { sessionKey: string; projectId: string | null; primaryPort: number; isolate: boolean; storageProfileId: string | null };
      sessionRequests.push(body);
      let session = sessions.get(body.sessionKey);
      if (!session) {
        session = { id: sessionId, slotId: 4, sessionKey: body.sessionKey, projectId: body.projectId, primaryPort: body.primaryPort, isolate: body.isolate, storageProfileId: body.storageProfileId };
        sessions.set(body.sessionKey, session);
      }
      return json(route, {
        ...session, bindings: [{ role: "primary", label: "Frontend", targetPort: session.primaryPort, targetProtocol: "http", slotId: session.slotId, publicUrl: slotUrl }],
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), routingRevision: 1, bridgeVersion: "v1", capabilities: [], limitations: [], slotGeneration: 1,
      });
    }
    if (path.startsWith("/previews/") && method !== "GET") {
      return json(route, { error: { code: "MOCK_MUTATION_BLOCKED", message: "Nicht gemockte Preview-Mutation blockiert", requestId: "preview-e2e", retryable: false, details: null } }, 403);
    }
    if (method !== "GET") return json(route, { error: { code: "MOCK_MUTATION_BLOCKED", message: "API-Mutation im Preview-E2E blockiert", requestId: "preview-e2e", retryable: false, details: null } }, 403);
    return json(route, { error: { code: "MOCK_NOT_FOUND", message: `Nicht gemockte Anfrage: ${method} ${path}`, requestId: "preview-e2e", retryable: false, details: null } }, 404);
  });
  return { sessions, sessionRequests };
}

test("Hub-Preview übernimmt Session und Slot in Orbit und behält sein iframe bei Routenwechseln", async ({ page }) => {
  const mocks = await installPreviewMocks(page);
  await enableOrbitInTestBrowser(page);
  await page.goto(`/wrapt/previews?project=${projectId}`);
  await expect(page.getByText("Preview öffnen", { exact: true })).toBeVisible();

  const popupPromise = page.context().waitForEvent("page");
  await page.getByLabel("Weitere Optionen").click();
  await page.getByRole("button", { name: /Preview-Werkzeuge im Tab/ }).click();
  const popup = await popupPromise;
  await expect.poll(() => mocks.sessionRequests.length).toBe(1);
  await expect(popup).toHaveURL(/\/wrapt\/previews\/live/);
  await popup.getByRole("combobox", { name: "Geräte-Preset wählen" }).selectOption("ipad-mini");
  const viewportWidth = popup.getByRole("spinbutton", { name: "Breite" });
  await viewportWidth.fill("780");
  await viewportWidth.press("Enter");
  const moveHandle = popup.getByRole("button", { name: "Leiste verschieben" });
  const moveBounds = await moveHandle.boundingBox();
  if (!moveBounds) throw new Error("Simulatorleiste hat keine messbare Fläche.");
  await popup.mouse.move(moveBounds.x + 20, moveBounds.y + 20);
  await popup.mouse.down();
  await popup.mouse.move(moveBounds.x + 60, moveBounds.y + 60);
  await popup.mouse.up();
  const resizeHandle = popup.getByRole("button", { name: "Leistenbreite ändern" });
  const resizeBounds = await resizeHandle.boundingBox();
  if (!resizeBounds) throw new Error("Griff für die Leistenbreite ist nicht sichtbar.");
  const toolbar = popup.locator(".preview-runtime-controls.is-simulator");
  const widthBeforeResize = await toolbar.evaluate((element) => element.getBoundingClientRect().width);
  await popup.mouse.move(resizeBounds.x + 20, resizeBounds.y + 20);
  await popup.mouse.down();
  await popup.mouse.move(resizeBounds.x - 60, resizeBounds.y + 20);
  await popup.mouse.up();
  await expect.poll(() => toolbar.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(widthBeforeResize);
  await expect.poll(() => popup.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.startsWith("wrapt:preview-simulator:") && value.includes('"toolbarWidth"') && value.includes('"deviceId":"ipad-mini"') && value.includes('"width":780')))).toBe(true);
  await popup.goto("/wrapt/orbit");
  await expect(popup.locator(".orbit-page")).toBeVisible();
  await popup.goBack();
  await expect(popup.getByRole("combobox", { name: "Geräte-Preset wählen" })).toHaveValue("ipad-mini");
  await expect(popup.getByRole("spinbutton", { name: "Breite" })).toHaveValue("780");
  await popup.close();

  const orbitAction = page.getByRole("button", { name: /Im Orbit öffnen/ });
  if (!(await orbitAction.isVisible())) await page.getByLabel("Weitere Optionen").click();
  await orbitAction.click();
  await expect(page).toHaveURL(/\/wrapt\/orbit$/);
  const orbitPreview = page.locator(".orbit-preview-slot-body iframe");
  await expect(orbitPreview).toHaveAttribute("src", /preview-slot-1\.wrapt\.test\/admin$/);
  await expect.poll(() => mocks.sessionRequests.length).toBeGreaterThanOrEqual(2);
  for (const request of mocks.sessionRequests) {
    expect(request).toMatchObject({ projectId, primaryPort: 4173, isolate: false, storageProfileId: null });
    expect(request.sessionKey).toBe(mocks.sessionRequests[0]?.sessionKey);
  }
  expect(mocks.sessions.size).toBe(1);
  expect(new Set([...mocks.sessions.values()].map((session) => session.slotId)).size).toBe(1);
  const sessionRequestCountBeforeRouteSwitches = mocks.sessionRequests.length;

  await page.evaluate(() => {
    (window as Window & { __previewIframe?: HTMLIFrameElement | null }).__previewIframe = document.querySelector(".orbit-preview-slot-body iframe");
  });
  await page.getByRole("button", { name: "Preview-Verwaltung öffnen" }).click();
  await expect(page).toHaveURL(/\/wrapt\/orbit\/previews$/);
  const sameIframe = () => page.evaluate(() => {
    const state = window as Window & { __previewIframe?: HTMLIFrameElement | null };
    return state.__previewIframe !== null && state.__previewIframe === document.querySelector(".orbit-preview-slot-body iframe");
  });
  await expect.poll(sameIframe).toBe(true);

  await page.getByRole("link", { name: "Previews", exact: true }).click();
  await expect(page).toHaveURL(/\/wrapt\/previews$/);
  await expect.poll(sameIframe).toBe(true);
  await page.getByRole("link", { name: "Orbit", exact: true }).click();
  await expect(page).toHaveURL(/\/wrapt\/orbit$/);
  await expect.poll(sameIframe).toBe(true);
  expect(mocks.sessionRequests).toHaveLength(sessionRequestCountBeforeRouteSwitches);
  expect(mocks.sessions.size).toBe(1);
});
