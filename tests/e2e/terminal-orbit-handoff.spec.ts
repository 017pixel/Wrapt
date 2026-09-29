import { expect, test, type Page } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";
import { enableOrbitInTestBrowser, resetOrbitTestWorkspace } from "./helpers/orbit";
import { resetTerminalTestWorkspace } from "./helpers/terminal";

const origin = process.env.WRAPT_E2E_URL ?? "http://127.0.0.1:3010";
const workbench = `${origin.replace(/\/$/, "")}/wrapt`;
const login = "terminal-orbit-handoff@example.com";
const headers = apiIdentityHeaders(login);

test.use({ extraHTTPHeaders: headers });

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.WRAPT_E2E_URL, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await enableOrbitInTestBrowser(page);
  await resetTerminalTestWorkspace(page, login);
  await resetOrbitTestWorkspace(page, login);
});

test.afterEach(async ({ page }) => {
  if (!process.env.WRAPT_E2E_URL) return;
  await resetOrbitTestWorkspace(page, login);
  await resetTerminalTestWorkspace(page, login);
});

async function runShellMarker(page: Page, marker: string): Promise<void> {
  const pane = page.locator(".terminal-session-pane.is-visible").first();
  const input = pane.locator(".xterm-helper-textarea");
  await input.fill("");
  await input.pressSequentially(`printf '%s\\n' '${marker}'; pwd`);
  await input.press("Enter");
  const screen = pane.locator(".xterm-screen");
  await expect(screen).toContainText(marker, { timeout: 20_000 });
}

test("händigt dieselbe Shell-Runtime zwischen Standalone und Orbit weiter", async ({ page }) => {
  await page.goto(`${workbench}/terminal`);
  const emptyState = page.locator(".terminal-empty-state");
  await expect(emptyState).toBeVisible();
  await emptyState.getByRole("button").click();
  await expect(page.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 20_000 });

  const sessionsUrl = new URL("/api/v1/terminal/sessions", origin).toString();
  const sessionsResponse = await page.request.get(sessionsUrl, { headers });
  await expect(sessionsResponse).toBeOK();
  const sessions = await sessionsResponse.json() as { sessions: Array<{ id: string; runtimeId: string; pid: number | null; cwd: string; kind: string; projectId: string | null }> };
  expect(sessions.sessions).toHaveLength(1);
  const originalSession = sessions.sessions[0]!;
  const runtimeId = originalSession.runtimeId;
  const beforeMarker = `__ORBIT_HANDOFF_BEFORE_${Date.now()}__`;
  await runShellMarker(page, beforeMarker);

  await page.getByRole("button", { name: "Weitere Terminalaktionen" }).click();
  await page.getByLabel("Laufende Sessions anzeigen").click();
  await page.getByRole("button", { name: "Session im Orbit öffnen" }).click();
  await expect(page).toHaveURL(/\/wrapt\/orbit$/);
  await expect(page.locator('.orbit-live-node [data-panel-type="terminal"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".orbit-live-node .xterm-screen")).toContainText(beforeMarker, { timeout: 20_000 });
  await expect(page.getByRole("status", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });

  const orbitUrl = new URL("/api/v1/orbit", origin).toString();
  const orbitResponse = await page.request.get(orbitUrl, { headers });
  const orbit = await orbitResponse.json() as { document: { boards: Array<{ nodes: Array<{ type: string; runtimeId: string | null }> }> } };
  const runtimeNodes = orbit.document.boards.flatMap((board) => board.nodes).filter((node) => node.type === "tool" && node.runtimeId === runtimeId);
  expect(runtimeNodes).toHaveLength(1);

  await page.getByRole("button", { name: "Alles zeigen" }).click();
  const openStandalone = page.getByRole("button", { name: "Werkzeug eigenständig öffnen" });
  await openStandalone.focus();
  await openStandalone.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/wrapt/terminal\\?session=${runtimeId}$`));
  const terminalPane = page.locator(".terminal-session-pane.is-visible").first();
  await expect(terminalPane).toBeVisible({ timeout: 20_000 });
  await expect(terminalPane.locator(".xterm-screen")).toContainText(beforeMarker, { timeout: 20_000 });
  const afterMarker = `__ORBIT_HANDOFF_AFTER_${Date.now()}__`;
  await runShellMarker(page, afterMarker);
  await expect(terminalPane.locator(".xterm-screen")).toContainText(afterMarker);
  const reopenedResponse = await page.request.get(sessionsUrl, { headers });
  const reopened = await reopenedResponse.json() as { sessions: Array<{ id: string; runtimeId: string; pid: number | null; cwd: string; kind: string; projectId: string | null }> };
  expect(reopened.sessions).toHaveLength(1);
  expect(reopened.sessions[0]).toMatchObject({
    id: originalSession.id,
    runtimeId: originalSession.runtimeId,
    pid: originalSession.pid,
    cwd: originalSession.cwd,
    kind: originalSession.kind,
    projectId: originalSession.projectId,
  });
});
