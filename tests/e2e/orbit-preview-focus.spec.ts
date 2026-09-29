import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";
import { resetOrbitTestWorkspace } from "./helpers/orbit";

const origin = process.env.WRAPT_E2E_URL;
const workbench = origin ? `${origin.replace(/\/$/, "")}/wrapt` : undefined;
const login = "orbit-preview-focus@example.com";
const headers = apiIdentityHeaders(login);
const boardId = "orbit-preview-focus-board";
const groupId = "orbit-preview-focus-group";
const slotId = "orbit-preview-focus-slot";
const orbitApi = origin ? new URL("/api/v1/orbit", origin).toString() : undefined;

test.use({ extraHTTPHeaders: headers, viewport: { width: 1440, height: 960 } });

test.beforeEach(async ({ page }) => {
  test.skip(!workbench || !orbitApi, "Set WRAPT_E2E_URL to a dedicated isolated Wrapt test server.");
  await resetOrbitTestWorkspace(page, login);
  const currentResponse = await page.request.get(orbitApi!, { headers });
  await expect(currentResponse).toBeOK();
  const current = await currentResponse.json() as { revision: number };
  const seedResponse = await page.request.put(orbitApi!, {
    headers,
    data: {
      expectedRevision: current.revision,
      document: {
        version: 8,
        activeBoardId: boardId,
        focusedNodeId: null,
        boards: [{
          id: boardId,
          name: "Preview-Fokus E2E",
          viewport: { x: 0, y: 0, zoom: 0.8 },
          worldBounds: { minX: -1_600, minY: -1_000, maxX: 4_000, maxY: 3_000 },
          nodes: [
            {
              id: groupId,
              type: "previewGroup",
              title: "Leere Testgruppe",
              position: { x: 180, y: 140 },
              size: { width: 516, height: 885 },
              projectId: null,
              parentId: null,
              runtimeId: null,
              toolType: null,
              previewId: null,
              previewLayout: "1",
              provider: null,
              content: "",
              language: null,
              locked: false,
              zIndex: 1,
            },
            {
              id: slotId,
              type: "previewSlot",
              title: "Leerer Slot",
              position: { x: 8, y: 52 },
              size: { width: 500, height: 825 },
              projectId: null,
              parentId: groupId,
              runtimeId: null,
              toolType: null,
              previewId: null,
              previewTarget: null,
              previewSlotId: null,
              provider: null,
              content: "",
              language: null,
              locked: false,
              zIndex: 2,
            },
          ],
          edges: [],
        }],
      },
    },
  });
  await expect(seedResponse).toBeOK();
});

test.afterEach(async ({ page }) => {
  if (!workbench) return;
  await resetOrbitTestWorkspace(page, login);
});

function zoomFromStyle(style: string | null): number {
  const scale = style?.match(/scale\(([^)]+)\)/)?.[1];
  if (!scale) throw new Error("Der React-Flow-Viewport enthält keinen Zoomfaktor.");
  return Number(scale);
}

test("ignoriert Doppelklicks in editierbaren Preview-Titeln für Fokus und Kamera", async ({ page }) => {
  await page.goto(`${workbench}/orbit`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  const group = page.locator(`.react-flow__node-orbit[data-id="${groupId}"]`);
  const slot = page.locator(`.react-flow__node-orbit[data-id="${slotId}"]`);
  const viewport = page.locator(".react-flow__viewport");
  const viewportBefore = await viewport.getAttribute("style");
  await page.evaluate(() => {
    window.addEventListener("orbit:focus-node", () => {
      const root = document.documentElement;
      root.dataset.orbitFocusRequestCount = String(Number(root.dataset.orbitFocusRequestCount ?? "0") + 1);
    });
  });

  await group.locator('input[aria-label="Name der Preview-Gruppe"]').dblclick();
  await slot.locator('input[aria-label="Slot-Label"]').dblclick();

  await expect.poll(() => viewport.getAttribute("style")).toBe(viewportBefore);
  await expect.poll(async () => {
    const response = await page.request.get(orbitApi!, { headers });
    const result = await response.json() as { document: { focusedNodeId: string | null } };
    return result.document.focusedNodeId;
  }).toBeNull();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.orbitFocusRequestCount ?? "0")).toBe("0");
});

test("fokussiert die Gruppe per Kopfzeilen-Doppelklick, ohne Slot-Ablösung", async ({ page }) => {
  await page.goto(`${workbench}/orbit`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  const group = page.locator(`.react-flow__node-orbit[data-id="${groupId}"]`);
  await expect(group.locator(".orbit-preview-group-header")).toBeVisible();
  const viewport = page.locator(".react-flow__viewport");
  const viewportBeforeFocus = await viewport.getAttribute("style");
  await page.evaluate(() => {
    document.documentElement.dataset.orbitDoubleClickCount = "0";
    document.addEventListener("dblclick", () => {
      const root = document.documentElement;
      root.dataset.orbitDoubleClickCount = String(Number(root.dataset.orbitDoubleClickCount) + 1);
    });
  });

  await group.locator(".orbit-preview-group-drag").dblclick();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(viewportBeforeFocus);
  await expect(group.locator(".orbit-preview-group")).toHaveClass(/is-selected/);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.orbitDoubleClickCount)).toBe("0");
  const savedResponse = await page.request.get(orbitApi!, { headers });
  const saved = await savedResponse.json() as { document: { boards: Array<{ nodes: Array<{ id: string; parentId: string | null }> }> } };
  const slot = saved.document.boards.flatMap((board) => board.nodes).find((node) => node.id === slotId);
  expect(slot?.parentId).toBe(groupId);
});

test("vergrößert die Ansicht per Doppelklick auf freier Desktop-Canvasfläche", async ({ page }) => {
  await page.goto(`${workbench}/orbit`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  const viewport = page.locator(".react-flow__viewport");
  const beforeZoom = zoomFromStyle(await viewport.getAttribute("style"));
  const emptyPoint = await page.locator(".orbit-page").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 140; y < bounds.bottom - 110; y += 32) {
      for (let x = bounds.left + 36; x < bounds.right - 36; x += 32) {
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
      }
    }
    return null;
  });
  expect(emptyPoint).not.toBeNull();
  await page.mouse.dblclick(emptyPoint!.x, emptyPoint!.y);
  await expect.poll(async () => {
    return zoomFromStyle(await viewport.getAttribute("style"));
  }).toBeGreaterThan(beforeZoom);
});

test("behält die mobile Fokus-Schaltfläche der Preview-Gruppe bei mindestens 44×44 CSS-Pixeln", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${workbench}/orbit`);
  await expect(page.locator(".orbit-page")).toHaveAttribute("data-mobile-mode", "navigate");
  const focus = page.locator(`.react-flow__node-orbit[data-id="${groupId}"] .orbit-preview-group-header > .orbit-node-focus`);
  await expect(focus).toBeAttached();
  const size = await focus.evaluate((element) => ({
    width: Number.parseFloat(getComputedStyle(element).width),
    height: Number.parseFloat(getComputedStyle(element).height),
  }));
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
});
