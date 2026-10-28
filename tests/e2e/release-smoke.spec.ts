import { expect, test } from "@playwright/test";

// `WRAPT_E2E_URL` zeigt auf den Origin des Testservers; die Wrapt
// selbst wird unter dem `/wrapt`-Basispfad ausgeliefert.
const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("verifies direct project tool navigation and previews", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");

  const projectsResponse = await page.request.get(new URL("/api/v1/projects", workbench).toString());
  await expect(projectsResponse).toBeOK();
  const projectsPayload = await projectsResponse.json() as {
    projects: Array<{ id: string; availability: string; previews: Array<{ id: string }> }>;
  };
  const projectWithPreview = projectsPayload.projects.find((project) => project.availability === "available" && project.previews.length > 0);
  expect(projectWithPreview).toBeDefined();
  const projectRoute = encodeURIComponent(projectWithPreview!.id);

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
