import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";
import { resetOrbitTestWorkspace } from "./helpers/orbit";

const workbench = process.env.WRAPT_E2E_URL;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("neue Orbit-Bausteine per Klick und Drag einsetzen und wieder laden", async ({ page, browserName }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Orbit test server.");
  const login = `orbit-tools-${browserName}-${testInfo.retry}@example.com`;
  await page.setExtraHTTPHeaders(apiIdentityHeaders(login));
  await resetOrbitTestWorkspace(page, login);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${workbench}/wrapt/orbit`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  const added = ["To-do-Liste", "Projektdatei", "Mediengalerie", "Dateigalerie", "Hermes Aufgaben", "Hermes Automatisierungen"];
  for (const label of added) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "To-do-Liste", exact: true }).click();
  const todo = page.locator(".orbit-todo").last();
  await expect(todo).toBeVisible();
  await todo.getByRole("textbox", { name: "Neue Aufgabe" }).fill("Palette prüfen");
  await todo.getByRole("button", { name: "Aufgabe hinzufügen" }).click();
  await expect(todo.getByRole("textbox", { name: "Aufgabe 1", exact: true })).toHaveValue("Palette prüfen");

  await page.getByRole("button", { name: "Projektdatei", exact: true }).dragTo(page.locator(".react-flow__pane"), {
    targetPosition: { x: 620, y: 420 },
  });
  await expect(page.locator(".orbit-file-path").last()).toBeVisible();
  await expect(page.getByRole("status", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });

  const response = await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders(login) });
  await expect(response).toBeOK();
  const saved = await response.json() as { document: { activeBoardId: string; boards: Array<{ id: string; nodes: Array<{ type: string; content: string }> }> } };
  const nodes = saved.document.boards.find((board) => board.id === saved.document.activeBoardId)?.nodes ?? [];
  expect(nodes.some((node) => node.type === "todo" && node.content.includes("Palette prüfen"))).toBe(true);
  expect(nodes.some((node) => node.type === "file")).toBe(true);

  await page.reload();
  await expect(page.locator(".orbit-file-path").last()).toBeVisible();
  await expect(page.locator(".orbit-todo").last().getByRole("textbox", { name: "Aufgabe 1", exact: true })).toHaveValue("Palette prüfen");
  expect(errors).toEqual([]);
});
