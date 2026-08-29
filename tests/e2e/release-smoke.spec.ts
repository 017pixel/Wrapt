import { expect, test } from "@playwright/test";
import { resetOrbitTestWorkspace } from "./helpers/orbit";

// `WRAPT_E2E_URL` zeigt auf den Origin des Testservers; die Wrapt
// selbst wird unter dem `/wrapt`-Basispfad ausgeliefert.
const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("verifies Browser, local ports and direct project tool navigation", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");

  await page.goto(`${workbench}/browser`);
  const address = page.getByLabel("Browser-Adresse");
  await expect(address).toBeVisible();
  await page.getByRole("button", { name: "Neuer Tab" }).click();
  await expect(page.getByText("Laufende Projekt-Dienste")).toBeVisible({ timeout: 20_000 });
  const localPorts = page.locator(".local-port-grid > button");
  const noLocalPorts = page.getByText("Momentan läuft kein lokaler Projekt-Devserver.");
  await expect.poll(async () => (await localPorts.count()) + (await noLocalPorts.count()), { timeout: 20_000 }).toBeGreaterThan(0);

  const projectsResponse = await page.request.get(new URL("/api/v1/projects", workbench).toString());
  await expect(projectsResponse).toBeOK();
  const projectsPayload = await projectsResponse.json() as {
    projects: Array<{ id: string; availability: string; previews: Array<{ id: string }> }>;
  };
  const projectWithPreview = projectsPayload.projects.find((project) => project.availability === "available" && project.previews.length > 0);
  expect(projectWithPreview).toBeDefined();
  const projectRoute = encodeURIComponent(projectWithPreview!.id);

  await address.fill("example.com");
  await address.press("Enter");
  await expect(address).toHaveValue(/https:\/\/example\.com\/?/, { timeout: 25_000 });
  await expect(page.getByAltText("Gerenderte Chromium-Seite")).toHaveAttribute("src", /^data:image\/jpeg;base64,/, { timeout: 25_000 });
  await expect.poll(() => page.getByAltText("Gerenderte Chromium-Seite").evaluate((image: HTMLImageElement) => image.naturalWidth / Math.max(1, image.clientWidth))).toBeGreaterThan(1.5);
  await page.reload();
  await expect(page.getByLabel("Browser-Adresse")).toHaveValue(/https:\/\/example\.com\/?/, { timeout: 25_000 });
  await expect(page.getByAltText("Gerenderte Chromium-Seite")).toHaveAttribute("src", /^data:image\/jpeg;base64,/, { timeout: 25_000 });
  await page.screenshot({ path: "/tmp/wrapt-011-browser.png", fullPage: true });

  await page.goto(`${workbench}/projects/${projectRoute}`);
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(page).toHaveURL(/\/wrapt\/code-editor$/);
  await page.goto(`${workbench}/projects/${projectRoute}`);
  await page.getByRole("button", { name: /T3/ }).first().click();
  await expect(page).toHaveURL(/\/wrapt\/t3-code$/);

  await page.goto(`${workbench}/projects/${projectRoute}`);
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();
  await expect(page).toHaveURL(/\/wrapt\/previews\?preview=/);

  await page.goto(`${workbench}/previews`);
  await expect(page.locator(".preview-hub")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Projektlaufzeit").last()).toBeVisible({ timeout: 20_000 });

  const dashboard = await (await page.request.get(new URL("/api/v1/usage/dashboard", workbench).toString())).json() as { forecasts: Array<{ providerId: string; accountId: string; windowId: string }> };
  const forecastKeys = dashboard.forecasts.map((forecast) => `${forecast.providerId}/${forecast.accountId}/${forecast.windowId}`);
  expect(new Set(forecastKeys).size).toBe(forecastKeys.length);
});

test("resizes selected Orbit nodes and keeps properties collapsed", async ({ page, browserName }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  const login = `orbit-release-${browserName}-${testInfo.retry}@example.com`;
  await page.setExtraHTTPHeaders({ "tailscale-user-login": login });
  await resetOrbitTestWorkspace(page, login);

  await page.goto(`${workbench}/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  const syncStatus = page.getByRole("button", { name: /Server gespeichert/ });
  await expect(syncStatus).toBeVisible({ timeout: 20_000 });
  await syncStatus.click();
  await expect(page.getByText("Alle Änderungen sind gespeichert.")).toBeVisible();
  await expect(page.getByText("Änderungen warten oder werden gespeichert.")).toBeVisible();
  await expect(page.getByText("Die Synchronisierung benötigt Aufmerksamkeit.")).toBeVisible();
  await syncStatus.click();

  await page.locator(".orbit-palette-item").filter({ hasText: "Neue Notiz" }).click();
  const noteCandidate = page.locator(".react-flow__node-orbit").filter({ has: page.locator(".orbit-node-shell") }).last();
  await expect(noteCandidate).toBeVisible();
  const noteId = await noteCandidate.getAttribute("data-id");
  expect(noteId).toBeTruthy();
  const note = page.locator(`.react-flow__node-orbit[data-id="${noteId}"]`);
  await expect(page.getByRole("button", { name: "Eigenschaften öffnen" })).toBeVisible();
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);
  await expect(note.locator(".orbit-resize-corner")).toHaveCount(8);

  const headerLocator = note.locator(".orbit-node-header");
  await headerLocator.click();
  await expect(note).toHaveClass(/selected/);
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);

  const beforeResize = await note.boundingBox();
  const resizeHandle = note.locator(".react-flow__resize-control.handle.bottom.right");
  await expect(resizeHandle).toBeVisible();
  const handle = await resizeHandle.boundingBox();
  expect(handle).not.toBeNull();
  expect(await resizeHandle.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect(handle!.width).toBeLessThanOrEqual(40);
  expect(handle!.height).toBeLessThanOrEqual(40);
  expect(handle!.width).toBeGreaterThan(10);
  expect(handle!.height).toBeGreaterThan(10);
  const resizeX = handle!.x + handle!.width / 2;
  const resizeY = handle!.y + handle!.height / 2;
  await page.mouse.move(resizeX, resizeY);
  await page.mouse.down();
  await page.mouse.move(resizeX + 80, resizeY + 36, { steps: 12 });
  await page.mouse.up();
  const afterResize = await note.boundingBox();
  expect(afterResize!.width).toBeGreaterThan(beforeResize!.width + 45);
  expect(afterResize!.height).toBeGreaterThan(beforeResize!.height + 30);
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);

  await page.locator(".orbit-palette-item").filter({ hasText: "Neuer Bereich" }).dragTo(page.locator(".react-flow__pane"), {
    // Ein Drop mit Zielposition fügt den Frame hinzu, ohne den Canvas auf
    // den großen Frame zu zentrieren und die Notiz aus dem Viewport zu drängen.
    targetPosition: { x: 650, y: 500 },
  });
  const frame = page.locator(".react-flow__node-orbit").filter({ has: page.locator(".orbit-frame-node") }).last();
  await expect(frame).toBeVisible();
  await expect(note.locator(".orbit-resize-corner")).toHaveCount(0);
  await expect(frame.locator(".orbit-resize-corner")).toHaveCount(8);
  const edgeCount = await page.locator(".react-flow__edge").count();
  await headerLocator.click();
  await expect(note).toHaveClass(/selected/);
  const source = await note.locator(".orbit-handle").last().boundingBox();
  const target = await frame.boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  const sourceHit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return `${element?.tagName ?? ""}.${typeof element?.className === "string" ? element.className : ""}`;
  }, { x: source!.x + source!.width / 2, y: source!.y + source!.height / 2 });
  expect(sourceHit).toContain("react-flow__handle");
  const connectionSource = await note.locator(".orbit-handle").last().boundingBox();
  const connectionTarget = await frame.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 56; y < bounds.bottom - 24; y += 32) {
      for (let x = bounds.left + 56; x < bounds.right - 24; x += 32) {
        const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>(".react-flow__node-orbit");
        if (hit === element) return { x, y };
      }
    }
    return null;
  });
  expect(connectionSource).not.toBeNull();
  expect(connectionTarget).not.toBeNull();
  await page.mouse.move(
    connectionSource!.x + connectionSource!.width / 2,
    connectionSource!.y + connectionSource!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    connectionSource!.x + connectionSource!.width / 2 + 36,
    connectionSource!.y + connectionSource!.height / 2,
    { steps: 3 },
  );
  await expect(page.locator(".react-flow__connection")).toHaveCount(1);
  await page.mouse.move(
    connectionTarget!.x,
    connectionTarget!.y,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCount + 1);

  const availableProjects = await (await page.request.get(new URL("/api/v1/projects", workbench).toString())).json() as { projects: Array<{ name: string; availability: string }> };
  const projectNames = availableProjects.projects.filter((project) => project.availability === "available").slice(0, 2).map((project) => project.name);
  expect(projectNames).toHaveLength(2);
  await page.getByRole("button", { name: `${projectNames[0]} ziehen`, exact: true }).click();
  await page.locator(".orbit-palette-item").filter({ hasText: "Neue Notiz" }).click();
  await page.getByRole("button", { name: `${projectNames[1]} ziehen`, exact: true }).click();
  await page.locator(".orbit-palette-item").filter({ hasText: "Neue Notiz" }).click();
  await expect.poll(async () => {
    const connectionColors = await page.locator(".react-flow__edge-path").evaluateAll((paths) => paths.map((path) => getComputedStyle(path).stroke));
    return new Set(connectionColors).size;
  }).toBeGreaterThanOrEqual(2);

  const minimap = await page.locator(".orbit-minimap").boundingBox();
  const territory = await page.locator(".orbit-territory-readout").boundingBox();
  expect(minimap).not.toBeNull();
  expect(territory).not.toBeNull();
  expect(territory!.y).toBeGreaterThan(minimap!.y + minimap!.height - 4);
  expect(Math.abs((territory!.x + territory!.width) - (minimap!.x + minimap!.width))).toBeLessThanOrEqual(4);
  const minimapViewport = await page.getByTestId("orbit-minimap-viewport").boundingBox();
  expect(minimapViewport).not.toBeNull();
  expect(Math.abs((minimapViewport!.x + minimapViewport!.width / 2) - (minimap!.x + minimap!.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs((minimapViewport!.y + minimapViewport!.height / 2) - (minimap!.y + minimap!.height / 2))).toBeLessThanOrEqual(2);
  await page.screenshot({ path: "/tmp/wrapt-011-orbit.png", fullPage: true });
});

test("keeps Browser and Orbit controls usable on mobile", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${workbench}/browser`);
  await page.getByRole("button", { name: "Neuer Tab" }).click();
  await expect(page.getByText("Laufende Projekt-Dienste")).toBeVisible({ timeout: 20_000 });
  const browserBounds = await page.locator(".app-shell").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(browserBounds.scrollWidth).toBeLessThanOrEqual(browserBounds.clientWidth);
  await expect(page.getByLabel("Browser-Adresse")).toBeVisible();
  await page.screenshot({ path: "/tmp/wrapt-011-mobile-browser.png", fullPage: true });

  await page.goto(`${workbench}/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await expect(page.locator(".orbit-minimap")).toBeHidden();
  const command = page.getByRole("button", { name: "Befehl" });
  const commandBox = await command.boundingBox();
  expect(commandBox).not.toBeNull();
  expect(commandBox!.height).toBeGreaterThanOrEqual(44);
  const orbitBounds = await page.locator(".orbit-page").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(orbitBounds.scrollWidth).toBeLessThanOrEqual(orbitBounds.clientWidth);
});
