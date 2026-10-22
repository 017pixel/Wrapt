import { expect } from "@playwright/test";
import { orbitWorkspaceSchema } from "../../packages/contracts/src/index";
import { resourceTest as test, prepareResources } from "./hermes-v2-resource-fixture";
import { apiIdentityHeaders } from "./helpers/environment";
import { resetOrbitTestWorkspace } from "./helpers/orbit";

const login = "user@example.com";
const nodeId = "hermes-resource-panel";
const headers = apiIdentityHeaders(login);
const isolated = Boolean(process.env.WRAPT_E2E_URL && process.env.WRAPT_E2E_ISOLATED === "true");
test.use({ extraHTTPHeaders: headers, viewport: { width: 1440, height: 960 } });
test.beforeEach(async ({ page, gateway }) => {
  test.skip(!isolated, "Orbit-Ressourcen benötigen einen ausdrücklich isolierten Testserver.");
  prepareResources(gateway);
  await resetOrbitTestWorkspace(page, login);
});
test.afterEach(async ({ page }) => {
  if (isolated) await resetOrbitTestWorkspace(page, login);
});

for (const [width, height] of [[450, 650], [680, 480]] as const) {
  test(`nutzt Ressourcen im echten Hermes-Orbitpanel mit ${width}×${height}`, async ({ page, gateway }) => {
    const origin = process.env.WRAPT_E2E_URL!;
    const orbitUrl = new URL("/api/v1/orbit", origin).toString();
    const currentResponse = await page.request.get(orbitUrl, { headers });
    await expect(currentResponse).toBeOK();
    const current = await currentResponse.json() as { revision: number };
    const boardId = "hermes-resources-own-board";
    const document = orbitWorkspaceSchema.parse({ version: 8, activeBoardId: boardId, focusedNodeId: null,
      boards: [{ id: boardId, name: "Eigene Hermes-Ressourcenprüfung", viewport: { x: 0, y: 0, zoom: 1 },
        worldBounds: { minX: -1000, minY: -800, maxX: 3000, maxY: 2000 }, edges: [],
        nodes: [{ id: nodeId, type: "tool", title: "Eigene Hermes-Ressourcen", position: { x: 100, y: 100 },
          size: { width, height }, projectId: null, parentId: null, runtimeId: null, toolType: "hermes",
          previewId: null, provider: null, content: "", language: null, locked: false, zIndex: 1 }] }],
    });
    const saved = await page.request.put(orbitUrl, { headers, data: { expectedRevision: current.revision, document } });
    await expect(saved).toBeOK();
    await page.goto("/wrapt/orbit");
    const node = page.locator(`.react-flow__node-orbit[data-id="${nodeId}"]`);
    await node.locator(".orbit-node-header").click();
    const panel = node.locator('[data-hermes-ui="v2"].is-panel');
    await expect(panel).toBeVisible();
    const bounds = await panel.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(width - 4);
    expect(bounds!.width).toBeLessThanOrEqual(width + 1);
    await expect(panel.locator("iframe")).toHaveCount(0);
    const memory = panel.getByRole("tab", { name: "Bereich: Memory", exact: true });
    await memory.click();
    await expect(panel.getByText("Eigene synthetische Projektnotiz", { exact: true })).toBeVisible();
    const cron = panel.getByRole("tab", { name: "Bereich: Cron", exact: true });
    await cron.click();
    await expect(panel.getByRole("button", { name: "Cron-Job: Eigener Prüfjob", exact: true })).toBeVisible();
    if (await panel.getByRole("tab", { name: "Bereich: Diagnose", exact: true }).isVisible()) {
      await panel.getByRole("tab", { name: "Bereich: Diagnose", exact: true }).click();
    } else {
      await panel.getByRole("tab", { name: "Weitere Hermes-Bereiche" }).click();
      await page.getByRole("dialog", { name: "Weitere Bereiche" }).getByRole("button", { name: "Diagnose", exact: true }).click();
    }
    await expect(panel).toContainText("Eigener redigierter Agentlog");
    expect(gateway.viewers.size).toBe(1);
    expect(gateway.calls.filter((call) => call.op === "session.subscribe")).toHaveLength(0);
    expect(gateway.calls.filter((call) => call.op === "session.stop")).toHaveLength(0);
    for (const label of ["Chat", "Cron", "Skills", "Memory"]) {
      const box = await panel.getByRole("tab", { name: `Bereich: ${label}`, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(35);
      expect(box!.height).toBeGreaterThanOrEqual(35);
    }
    expect((await panel.boundingBox())!.width).toBe(bounds!.width);
  });
}
