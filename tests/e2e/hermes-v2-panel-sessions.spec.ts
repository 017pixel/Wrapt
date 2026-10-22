import { expect, type Page } from "@playwright/test";
import { orbitWorkspaceSchema } from "../../packages/contracts/src/index";
import { resourceTest as test, prepareResources, sessionId } from "./hermes-v2-resource-fixture";
import { apiIdentityHeaders } from "./helpers/environment";
import { resetOrbitTestWorkspace } from "./helpers/orbit";

const login = "user@example.com";
const headers = apiIdentityHeaders(login);
const nodeId = "hermes-session-panel";
const isolated = Boolean(process.env.WRAPT_E2E_URL && process.env.WRAPT_E2E_ISOLATED === "true");
test.use({ extraHTTPHeaders: headers, viewport: { width: 1440, height: 1000 } });
test.beforeEach(async ({ page, gateway }) => {
  test.skip(!isolated, "Die Panelprüfung benötigt eine ausdrücklich isolierte Testinstanz.");
  prepareResources(gateway);
  await resetOrbitTestWorkspace(page, login);
});
test.afterEach(async ({ page }) => {
  if (isolated) await resetOrbitTestWorkspace(page, login);
});

const panel = (page: Page) => page.locator(`.react-flow__node-orbit[data-id="${nodeId}"] [data-hermes-ui="v2"].is-panel`);
const composer = (page: Page) => panel(page).getByRole("textbox", { name: "Nachricht an Hermes", exact: true });
const orbitUrl = () => new URL("/api/v1/orbit", process.env.WRAPT_E2E_URL!).toString();

async function openOwnPanel(page: Page) {
  const currentResponse = await page.request.get(orbitUrl(), { headers });
  await expect(currentResponse).toBeOK();
  const current = await currentResponse.json() as { revision: number };
  const boardId = "hermes-session-own-board";
  const document = orbitWorkspaceSchema.parse({ version: 8, activeBoardId: boardId, focusedNodeId: null,
    boards: [{ id: boardId, name: "Eigene Hermes-Sitzungsprüfung", viewport: { x: 0, y: 0, zoom: 1 },
      worldBounds: { minX: -1000, minY: -800, maxX: 3000, maxY: 2000 }, edges: [],
      nodes: [{ id: nodeId, type: "tool", title: "Eigene Hermes-Panelprüfung", position: { x: 100, y: 100 },
        size: { width: 500, height: 740 }, projectId: null, parentId: null, runtimeId: null, toolType: "hermes",
        previewId: null, provider: null, content: "", language: null, locked: false, zIndex: 1,
        state: { ownMarker: "bleibt erhalten" } }] }],
  });
  const saved = await page.request.put(orbitUrl(), { headers, data: { expectedRevision: current.revision, document } });
  await expect(saved).toBeOK();
  await page.goto("/wrapt/orbit");
  await page.locator(`.react-flow__node-orbit[data-id="${nodeId}"] .orbit-node-header`).click();
  await expect(panel(page)).toBeVisible();
}

async function savedNode(page: Page) {
  const response = await page.request.get(orbitUrl(), { headers });
  await expect(response).toBeOK();
  const data = await response.json() as { document: unknown };
  const document = orbitWorkspaceSchema.parse(data.document);
  return document.boards.flatMap((board) => board.nodes).find((node) => node.id === nodeId)!;
}

test("behält eine im echten Orbitpanel erstellte Sitzung mit Nachricht nach Reload", async ({ page, gateway }) => {
  await openOwnPanel(page);
  await panel(page).getByRole("button", { name: "Neuer Chat", exact: true }).click();
  await page.getByRole("button", { name: "Sitzung erstellen", exact: true }).click();
  await expect(composer(page)).toBeEnabled();
  await composer(page).fill("Eigene Nachricht aus dem Orbitpanel");
  await composer(page).press("Enter");
  await expect(panel(page).getByText("Native Antwort aus dem Browser-Test.", { exact: true })).toBeVisible();
  expect(gateway.calls.filter((call) => call.op === "session.create")).toHaveLength(1);
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(1);
  await expect.poll(async () => JSON.stringify(await savedNode(page))).toContain("stored-created-1");
  expect((await savedNode(page)).state.ownMarker).toBe("bleibt erhalten");
  expect(new URL(page.url()).searchParams.has("session")).toBe(false);
  await page.reload();
  await page.locator(`.react-flow__node-orbit[data-id="${nodeId}"] .orbit-node-header`).click();
  await expect(composer(page)).toBeEnabled();
  await expect(panel(page).getByText("Eigene Nachricht aus dem Orbitpanel", { exact: true })).toHaveCount(1);
  await expect(panel(page).getByRole("link", { name: "Klassisch", exact: true })).toHaveAttribute("href", /session=stored-created-1/);
  await expect(panel(page).getByRole("link", { name: "Fenster", exact: true })).toHaveAttribute("href", /\/wrapt\/hermes-v2\/standalone\?session=stored-created-1$/);
  expect(gateway.calls.filter((call) => call.op === "session.create")).toHaveLength(1);
  expect(gateway.calls.filter((call) => call.op === "message.submit")).toHaveLength(1);
});

test("wählt im echten schmalen Orbitpanel eine bestehende Sitzung ohne neue Sitzung oder Nachricht", async ({ page, gateway }) => {
  await openOwnPanel(page);
  const opener = panel(page).getByRole("button", { name: "Sitzungen", exact: true });
  await expect(opener).toBeVisible();
  await opener.click();
  const row = panel(page).locator(`[data-session-id="${sessionId}"] .hermesv2-rowselect`);
  await expect(row).toBeVisible();
  await row.click();
  await expect(composer(page)).toBeEnabled();
  await expect.poll(() => gateway.calls.filter((call) => call.op === "session.subscribe" && call.sessionId === sessionId).length).toBe(1);
  await expect.poll(async () => JSON.stringify(await savedNode(page))).toContain(sessionId);
  expect((await savedNode(page)).state.ownMarker).toBe("bleibt erhalten");
  expect(new URL(page.url()).searchParams.has("session")).toBe(false);
  expect(gateway.calls.filter((call) => ["session.create", "message.submit", "session.stop"].includes(call.op))).toHaveLength(0);
  await page.reload();
  await page.locator(`.react-flow__node-orbit[data-id="${nodeId}"] .orbit-node-header`).click();
  await expect(composer(page)).toBeEnabled();
  await expect(panel(page).getByRole("link", { name: "Klassisch", exact: true })).toHaveAttribute("href", new RegExp(`session=${sessionId}`));
  const standalone = panel(page).getByRole("link", { name: "Fenster", exact: true });
  await expect(standalone).toHaveAttribute("href", new RegExp(`/wrapt/hermes-v2/standalone\\?session=${sessionId}$`));
  await expect(standalone).toHaveAttribute("target", "_blank");
  await expect(standalone).toHaveAttribute("rel", /noopener/);
  const [popup] = await Promise.all([page.waitForEvent("popup"), standalone.click()]);
  try {
    await expect(popup.getByRole("textbox", { name: "Nachricht an Hermes", exact: true })).toBeEnabled();
    await expect(popup).toHaveURL(new RegExp(`/wrapt/hermes-v2/standalone\\?session=${sessionId}$`));
    await expect(popup.getByRole("link", { name: "Klassisch", exact: true })).toHaveAttribute("href", new RegExp(`session=${sessionId}`));
    expect(gateway.calls.filter((call) => ["session.create", "message.submit", "session.stop"].includes(call.op))).toHaveLength(0);
  } finally { await popup.close(); }
});

test("erreicht die Sitzungsöffnung auch im schmalen Orbitpanel mit einem vollständigen Touchziel", async ({ page, gateway }) => {
  await openOwnPanel(page);
  const opener = panel(page).getByRole("button", { name: "Sitzungen", exact: true });
  const box = await opener.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(opener).toBeInViewport({ ratio: 1 });
  await opener.click();
  await expect(panel(page).getByRole("searchbox", { name: /Sitzungen/ })).toBeVisible();
  expect(gateway.calls.filter((call) => ["message.submit", "session.create", "session.stop"].includes(call.op))).toHaveLength(0);
});
