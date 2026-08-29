import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";

const workbench = process.env.WRAPT_E2E_URL;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "ui-check@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("shows real recent projects, collapsed separators and preserves legacy Notion", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  const projects = await (await page.request.get(new URL("/api/v1/projects", workbench).toString(), { headers: apiIdentityHeaders("ui-check@example.com") })).json() as {
    projects: Array<{ id: string; name: string; path: string; availability: string; activity: { effectiveAt: string | null } }>;
    projectsRoot: string;
    recentLimit: number;
  };
  // Der konfigurierte Browser-Root ist eine Navigationsgrenze und kein
  // registrierbarer Projektordner. Für die Prüfung wird deshalb ein echtes
  // verfügbares Projekt innerhalb der Grenze gewählt.
  const selectedProject = projects.projects.find((project) => project.availability === "available" && project.path !== projects.projectsRoot);
  expect(selectedProject).toBeDefined();

  const orbitUrl = new URL("/api/v1/orbit", workbench).toString();
  const currentOrbitResponse = await page.request.get(orbitUrl, { headers: apiIdentityHeaders("ui-check@example.com") });
  expect(currentOrbitResponse).toBeOK();
  const currentOrbit = await currentOrbitResponse.json() as {
    document: { activeBoardId: string; focusedNodeId: string | null; boards: Array<{ id: string; nodes: Array<Record<string, unknown>> }> };
    revision: number;
  };
  const activeBoard = currentOrbit.document.boards.find((board) => board.id === currentOrbit.document.activeBoardId);
  expect(activeBoard).toBeDefined();
  const legacyNodeId = `legacy-notion-${Date.now()}`;
  const legacyNotionNode = {
    id: legacyNodeId,
    type: "tool",
    title: "Legacy Notion",
    position: { x: 120, y: 120 },
    size: { width: 360, height: 240 },
    projectId: null,
    parentId: null,
    runtimeId: null,
    toolType: "notion",
    previewId: null,
    provider: null,
    content: "",
    language: null,
    color: null,
    locked: false,
    zIndex: Math.max(0, ...activeBoard!.nodes.map((node) => Number(node.zIndex ?? 0))) + 1,
  };
  const seededDocument = {
    ...currentOrbit.document,
    focusedNodeId: legacyNodeId,
    boards: currentOrbit.document.boards.map((board) => board.id === activeBoard!.id
      ? { ...board, nodes: [...board.nodes, legacyNotionNode] }
      : board),
  };
  const saveResponse = await page.request.put(orbitUrl, {
    headers: { ...apiIdentityHeaders("ui-check@example.com"), "x-wrapt-sync-version": "2" },
    data: { document: seededDocument, expectedRevision: currentOrbit.revision },
  });
  expect(saveResponse).toBeOK();

  await page.goto(`${workbench}/wrapt/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await expect(page.getByRole("button", { name: /neue-datei\.ts/ })).toHaveCount(0);
  const projectSectionButtons = page.locator(".sidebar-section").nth(1).locator("button.orbit-palette-item");
  expect((await projectSectionButtons.count()) - 1).toBeLessThanOrEqual(projects.recentLimit);

  await page.getByRole("button", { name: "Alle Projekte auswählen" }).click();
  const picker = page.getByRole("dialog", { name: "Serverprojekt öffnen" });
  await expect(picker).toBeVisible();
  await picker.getByRole("textbox", { name: "Serverpfad" }).fill(selectedProject!.path);
  await picker.getByRole("button", { name: "Öffnen", exact: true }).click();
  await expect(picker.locator(".orbit-server-tree-row.is-selected")).toHaveAttribute("data-path", selectedProject!.path);
  await picker.getByRole("button", { name: "Im Orbit öffnen" }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator(".orbit-project-node").filter({ hasText: selectedProject!.name })).toBeVisible();
  await expect(projectSectionButtons.first()).toContainText(selectedProject!.name);

  await page.getByLabel("Sidebar einklappen").click();
  const sectionCount = await page.locator(".sidebar-section").count();
  await expect(page.locator(".sidebar-section-divider")).toHaveCount(sectionCount);
  await page.getByLabel("Sidebar ausklappen").click();

  await expect(page.locator(".orbit-palette-item").filter({ hasText: /^Notionziehen$/ })).toHaveCount(0);
  const notion = page.locator('.orbit-live-node [data-panel-type="notion"]').last();
  await expect(notion).toBeVisible();
  await expect(notion).toContainText("Notion-Integration wird nicht mehr ausgeführt");
});
