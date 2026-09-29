import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";

const workbench = process.env.WRAPT_E2E_URL;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

function node(id: string, type: "project" | "note" | "snippet" | "tool", title: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  return {
    id, type, title, position: { x, y }, size: type === "project" ? { width: 240, height: 170 } : type === "tool" ? { width: 620, height: 380 } : type === "snippet" ? { width: 390, height: 300 } : { width: 340, height: 220 },
    projectId: type === "project" ? "chappie" : null, parentId: null, runtimeId: type === "tool" ? `${id}-runtime` : null,
    toolType: type === "tool" ? "terminal" : null, previewId: null, provider: null, content: "", language: type === "snippet" ? "typescript" : null, locked: false, zIndex: type === "project" ? 1 : 2,
    ...extra,
  };
}

test("covers precise canvas chrome, menus, zoom and editable routing", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Orbit test server.");
  const orbitUrl = new URL("/api/v1/orbit", workbench).toString();
  const current = await (await page.request.get(orbitUrl, { headers: apiIdentityHeaders("user@example.com") })).json();
  const boardId = `improvements-${Date.now()}`;
  const seed = await page.request.put(orbitUrl, { headers: apiIdentityHeaders("user@example.com"), data: { expectedRevision: current.revision, document: {
    version: 7, activeBoardId: boardId, focusedNodeId: null, boards: [{
      id: boardId, name: "Verbesserungen", viewport: { x: 180, y: 170, zoom: .68 }, worldBounds: { minX: -1_600, minY: -1_000, maxX: 6_400, maxY: 1_400 },
      nodes: [
        node("project", "project", "Sample", -100, 0),
        node("note", "note", "Plan", 440, -120, { projectId: "chappie", content: "Test" }),
        node("terminal", "tool", "Terminal", 1_050, 180),
        node("offscreen-snippet", "snippet", "Bleibt geladen", 5_200, 0, { content: "const retained = true;" }),
      ],
      edges: [
        { id: "project-edge", source: "project", target: "note", kind: "project", label: "gehört zu" },
        { id: "manual-edge", source: "note", target: "terminal", kind: "manual", label: "besprechen" },
      ],
    }],
  } } });
  await expect(seed).toBeOK();

  await page.goto(`${workbench}/wrapt/orbit`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await expect(page.getByLabel("Gespeicherte Szene öffnen")).toHaveCount(0);
  await page.getByRole("button", { name: "Arbeitsfläche umbenennen" }).click();
  await page.getByLabel("Name der Arbeitsfläche").fill("Dauerhafte Werkzeuge");
  await page.getByRole("button", { name: "Arbeitsfläche umbenennen speichern" }).click();
  const boardSwitcher = page.locator(".orbit-board-picker-trigger");
  await expect(boardSwitcher).toHaveAttribute("aria-label", "Arbeitsfläche: Dauerhafte Werkzeuge");
  await expect(page.getByRole("status", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  const offscreenSnippet = page.locator('.react-flow__node-orbit[data-id="offscreen-snippet"]');
  await expect(offscreenSnippet).toBeAttached();
  expect(await offscreenSnippet.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.right < 0 || bounds.left > window.innerWidth || bounds.bottom < 0 || bounds.top > window.innerHeight;
  })).toBe(true);
  const offscreenDraft = offscreenSnippet.getByLabel("Bleibt geladen Code bearbeiten");
  await offscreenDraft.fill("Ungespeicherter Entwurf bleibt erhalten", { force: true });
  const noteNode = page.locator('.react-flow__node-orbit[data-id="note"]');
  const viewport = page.locator(".react-flow__viewport");
  const beforeHeaderFocus = await viewport.getAttribute("style");
  await noteNode.locator(".orbit-node-header strong").dblclick();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(beforeHeaderFocus);
  await noteNode.getByRole("button", { name: "Fenster zentrieren" }).click();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(beforeHeaderFocus);
  const focusAction = noteNode.getByRole("button", { name: "Fenster zentrieren" });
  const overlayProbe = await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>(".orbit-main-island");
    const action = document.querySelector<HTMLElement>('.react-flow__node-orbit[data-id="note"] .orbit-node-focus');
    const node = action?.closest<HTMLElement>(".react-flow__node-orbit");
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!toolbar || !action || !node || !viewport) throw new Error("Orbit-Steuerleiste, Notizknoten oder Fokusaktion fehlt.");
    const toolbarBounds = toolbar.getBoundingClientRect();
    const actionBounds = action.getBoundingClientRect();
    const point = { x: toolbarBounds.left + 1, y: toolbarBounds.top + toolbarBounds.height / 2 };
    const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a;
    const deltaX = (point.x - actionBounds.left - actionBounds.width / 2) / zoom;
    const deltaY = (point.y - actionBounds.top - actionBounds.height / 2) / zoom;
    const originalTransform = node.style.transform;
    node.style.transform = `${originalTransform} translate(${deltaX}px, ${deltaY}px)`;
    return { point, originalTransform };
  });
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".orbit-node-focus")?.getAttribute("aria-label"), overlayProbe.point)).toBe("Fenster zentrieren");
  await focusAction.click();
  await noteNode.evaluate((element, transform) => { (element as HTMLElement).style.transform = transform; }, overlayProbe.originalTransform);
  await noteNode.locator(".orbit-node-header").click();
  const corner = noteNode.locator(".orbit-resize-corner.top.left");
  await expect(corner).toHaveCSS("width", "32px");
  await expect(corner).toHaveCSS("height", "32px");
  await expect(corner).toHaveCSS("top", "0px");
  await expect(corner).toHaveCSS("left", "0px");
  const [nodeBounds, dotBounds] = await Promise.all([noteNode.boundingBox(), corner.locator(".orbit-resize-dot").boundingBox()]);
  expect(Math.abs((dotBounds!.x + dotBounds!.width / 2) - nodeBounds!.x)).toBeLessThanOrEqual(3);
  expect(Math.abs((dotBounds!.y + dotBounds!.height / 2) - nodeBounds!.y)).toBeLessThanOrEqual(3);

  const inspectorTrigger = page.getByRole("button", { name: "Eigenschaften öffnen" });
  const inspectorBox = await inspectorTrigger.boundingBox();
  expect(inspectorBox!.height).toBeGreaterThan(inspectorBox!.width * 2);

  await noteNode.click({ button: "right" });
  await expect(page.getByRole("menu", { name: "Plan" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Eigenschaften" })).toBeVisible();
  await page.keyboard.press("Escape");

  const projectCard = page.locator('.react-flow__node-orbit[data-id="project"] .orbit-project-node');
  const projectPath = page.locator('.react-flow__edge[data-id="project-edge"] .react-flow__edge-path');
  await expect(projectPath).toBeVisible();
  expect(await projectCard.evaluate((card) => {
    const path = document.querySelector('.react-flow__edge[data-id="project-edge"] .react-flow__edge-path');
    if (!path) return false;
    const color = getComputedStyle(card).getPropertyValue("--orbit-project-color").trim();
    const probe = document.createElement("span"); probe.style.color = color; document.body.append(probe);
    const normalized = getComputedStyle(probe).color; probe.remove();
    return normalized === getComputedStyle(path).stroke;
  })).toBe(true);

  const interactionPath = page.locator('.react-flow__edge[data-id="manual-edge"] .react-flow__edge-interaction');
  const edgePoint = await interactionPath.evaluate((path) => {
    const svgPath = path as SVGPathElement;
    const point = svgPath.getPointAtLength(svgPath.getTotalLength() / 2);
    const transformed = new DOMPoint(point.x, point.y).matrixTransform(svgPath.getScreenCTM() ?? new DOMMatrix());
    return { x: transformed.x, y: transformed.y };
  });
  await interactionPath.dispatchEvent("click", { clientX: edgePoint.x, clientY: edgePoint.y, bubbles: true });
  expect(await page.locator(".orbit-edge-waypoint").count()).toBeGreaterThan(3);
  await page.getByRole("button", { name: /Bearbeiten/ }).click();
  await page.getByLabel("Verbindungstext").fill("wird umgesetzt durch");
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page.getByText("wird umgesetzt durch")).toBeVisible();

  await page.getByRole("button", { name: "Alles zeigen" }).click();
  const terminalNode = page.locator('.react-flow__node-orbit[data-id="terminal"]');
  await expect(terminalNode).toBeVisible();
  let previousPosition: { x: number; y: number } | null = null;
  let stableSamples = 0;
  await expect.poll(async () => {
    const bounds = await terminalNode.boundingBox();
    if (!bounds) return false;
    stableSamples = previousPosition && Math.abs(bounds.x - previousPosition.x) < .1 && Math.abs(bounds.y - previousPosition.y) < .1
      ? stableSamples + 1
      : 0;
    previousPosition = { x: bounds.x, y: bounds.y };
    return stableSamples >= 2;
  }).toBe(true);
  const dragHandle = terminalNode.locator(".orbit-node-header strong");
  await expect(dragHandle).toBeVisible();
  const contentBox = await terminalNode.locator(".orbit-tool-content").boundingBox();
  const beforeDrag = await terminalNode.boundingBox();
  const viewportBeforeDrag = await page.locator(".react-flow__viewport").evaluate((element) => getComputedStyle(element).transform);
  expect(contentBox).not.toBeNull();
  expect(beforeDrag).not.toBeNull();
  const dragHandleBox = await dragHandle.boundingBox();
  expect(dragHandleBox).not.toBeNull();
  await page.mouse.move((dragHandleBox?.x ?? 0) + (dragHandleBox?.width ?? 0) / 2, (dragHandleBox?.y ?? 0) + (dragHandleBox?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move((dragHandleBox?.x ?? 0) + (dragHandleBox?.width ?? 0) / 2 + 14, (dragHandleBox?.y ?? 0) + (dragHandleBox?.height ?? 0) / 2 + 18, { steps: 4 });
  await page.mouse.move((contentBox?.x ?? 0) + (contentBox?.width ?? 0) * .68, (contentBox?.y ?? 0) + (contentBox?.height ?? 0) * .62, { steps: 12 });
  const duringDrag = await terminalNode.boundingBox();
  expect(duringDrag?.x).toBeGreaterThan((beforeDrag?.x ?? 0) + 8);
  await page.mouse.up();
  const afterDrag = await terminalNode.boundingBox();
  expect(afterDrag?.x).toBeGreaterThan((beforeDrag?.x ?? 0) + 8);
  await page.mouse.move((contentBox?.x ?? 0) + 180, (contentBox?.y ?? 0) + 70, { steps: 8 });
  await expect.poll(() => terminalNode.boundingBox()).toEqual(afterDrag);
  await expect.poll(() => page.locator(".react-flow__viewport").evaluate((element) => getComputedStyle(element).transform)).toBe(viewportBeforeDrag);

  const zoomViewport = page.locator(".react-flow__viewport");
  const beforeTransform = await zoomViewport.evaluate((element) => getComputedStyle(element).transform);
  const beforePageScale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  await terminalNode.locator(".orbit-tool-content").dispatchEvent("wheel", { ctrlKey: true, deltaY: -120, clientX: 700, clientY: 500 });
  await expect.poll(() => zoomViewport.evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeTransform);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(beforePageScale);

  const panePoint = await page.locator(".orbit-page").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 140; y < bounds.bottom - 110; y += 32) {
      for (let x = bounds.left + 36; x < bounds.right - 36; x += 32) {
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
      }
    }
    return null;
  });
  expect(panePoint).not.toBeNull();
  await page.mouse.click(panePoint?.x ?? 0, panePoint?.y ?? 0, { button: "right" });
  const quickMenu = page.getByRole("menu", { name: "Neue Fläche" });
  await expect(page.getByRole("region", { name: "Schnellaktionen" })).toBeVisible();
  await expect(quickMenu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Neues Terminal" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(quickMenu).toHaveCount(0);
  await page.mouse.click(panePoint?.x ?? 0, panePoint?.y ?? 0, { button: "right" });
  await expect(quickMenu).toBeVisible();
  const secondPanePoint = await page.locator(".orbit-page").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 180; y < bounds.bottom - 120; y += 32) {
      for (let x = bounds.left + bounds.width / 2; x < bounds.right - 36; x += 32) {
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
      }
    }
    return null;
  });
  expect(secondPanePoint).not.toBeNull();
  await page.mouse.click(secondPanePoint?.x ?? 0, secondPanePoint?.y ?? 0);
  await expect(quickMenu).toHaveCount(0);
  await expect(offscreenDraft).toHaveValue("Ungespeicherter Entwurf bleibt erhalten");
});
