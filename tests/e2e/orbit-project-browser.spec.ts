import { expect, test } from "@playwright/test";

const workbench = process.env.WRAPT_E2E_URL;

test.describe("Orbit project browser desktop", () => {
  test.use({
    extraHTTPHeaders: { "tailscale-user-login": "project-browser@example.com" },
    viewport: { width: 1440, height: 960 },
  });

  test("navigates the server tree and opens a selected folder in Orbit", async ({ page }) => {
    test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
    await page.goto(`${workbench}/wrapt/workbench`);
    await expect(page.locator(".orbit-page")).toBeVisible();

    await page.getByRole("button", { name: "Alle Projekte auswählen" }).click();
    const browser = page.getByRole("dialog", { name: "Serverprojekt öffnen" });
    await expect(browser).toBeVisible();
    await expect(browser).toHaveCSS("width", /\d+px/);
    const projectsResponse = await page.request.get(new URL("/api/v1/projects", workbench).toString(), { headers: { "tailscale-user-login": "project-browser@example.com" } });
    const projects = await projectsResponse.json() as { projects: Array<{ name: string; path: string; availability: string }> };
    const selectedProject = projects.projects.find((project) => project.availability === "available");
    expect(selectedProject).toBeDefined();
    await browser.getByRole("textbox", { name: "Serverpfad" }).fill(selectedProject!.path);
    await browser.getByRole("button", { name: "Öffnen", exact: true }).click();

    // Der isolierte Server verwendet das Wrapt-Repository als Browser-Root.
    // Für den eigentlichen Registrierungsfluss wählen wir deshalb eine
    // untergeordnete, dynamisch gefundene Ordnerzeile.
    const childRow = browser.locator('.orbit-server-tree-row:not([aria-disabled="true"])').first();
    const projectPath = await childRow.getAttribute("data-path");
    expect(projectPath).toBeTruthy();
    await browser.getByRole("textbox", { name: "Serverpfad" }).fill(projectPath!);
    await browser.getByRole("button", { name: "Öffnen", exact: true }).click();
    await expect(browser.locator(".orbit-server-tree-row.is-selected")).toHaveAttribute("data-path", projectPath);
    await browser.getByRole("button", { name: "Im Orbit öffnen" }).click();

    await expect(browser).toHaveCount(0);
    const projectName = projectPath!.split("/").at(-1)!;
    await expect(page.locator(".orbit-project-node").filter({ hasText: projectName })).toBeVisible();
    await expect(page.locator(".sidebar-section").nth(1).locator("button.orbit-palette-item").first()).toContainText(projectName);
  });
});

test.describe("Orbit project browser mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("opens as a safe-area fullscreen dialog from the command palette", async ({ page }) => {
    test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
    await page.goto(`${workbench}/wrapt/workbench`);
    await page.getByRole("button", { name: "Befehl" }).click();
    await page.getByRole("button", { name: /Projektordner durchsuchen/ }).click();

    const browser = page.getByRole("dialog", { name: "Serverprojekt öffnen" });
    await expect(browser).toBeVisible();
    const bounds = await browser.boundingBox();
    expect(bounds?.x).toBe(0);
    expect(bounds?.width).toBe(390);
    expect(bounds?.height).toBe(844);
    await expect(browser.getByRole("textbox", { name: "Serverpfad" })).toHaveCSS("font-size", "16px");
    const action = browser.getByRole("button", { name: "Im Orbit öffnen" });
    const actionBounds = await action.boundingBox();
    expect(actionBounds?.height).toBeGreaterThanOrEqual(44);
    await expect(action).toBeDisabled();
    await browser.getByRole("button", { name: "Dialog schließen" }).click();
    await expect(browser).toHaveCount(0);
  });
});
