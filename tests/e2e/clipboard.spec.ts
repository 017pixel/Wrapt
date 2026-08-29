import { expect, test, type Page } from "@playwright/test";
import { resetOrbitTestWorkspace } from "./helpers/orbit";
import { resetTerminalTestWorkspace } from "./helpers/terminal";

// `WRAPT_E2E_URL` zeigt auf den Origin des Testservers; die Wrapt
// selbst wird unter dem `/workbench`-Basispfad ausgeliefert.
const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  permissions: ["clipboard-read", "clipboard-write"],
});

// Firefox kennt `clipboard-read` nicht: Schon das Anlegen des Kontexts scheitert, bevor
// ein Test laufen kann. Der Ausschluss muss deshalb hier auf Dateiebene stehen und nicht
// erst im Testrumpf — dort wären die Fixtures längst erzeugt.
// Die Zwischenablage bleibt für Firefox in der manuellen Matrix.
test.skip(({ browserName }) => browserName !== "chromium", "Zwischenablage-Automatisierung wird in Chromium geprüft.");

test.beforeEach(async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await resetTerminalTestWorkspace(page, "user@example.com");
});

async function openFirstTerminal(page: Page): Promise<void> {
  const emptyButton = page.locator(".terminal-empty-state button").first();
  const entries = page.locator(".terminal-tree-entry");
  await expect.poll(async () => (await emptyButton.count()) + (await entries.count()), { timeout: 20_000 }).toBeGreaterThan(0);
  if (await emptyButton.isVisible().catch(() => false)) await emptyButton.click();
  await expect(page.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 20_000 });
}

test("copies terminal selections with Ctrl+Shift+C and pastes with Ctrl+Shift+V", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/terminal`);
  await openFirstTerminal(page);
  const input = page.locator(".xterm-helper-textarea");
  const marker = `https://github.com/login/device?code=CLIP-${Date.now()}`;
  // Erst auf den Shell-Prompt warten: Tippt der Test vor dem Spawn der
  // Shell, gehen einzelne Zeichen verloren und der Marker erscheint nie
  // unversehrt im Echo. Die Prüfung liest die sichtbaren Zeilen — die
  // xterm-Stylesheet-Injektion in `.xterm-screen` enthielte sonst „#"-Farben
  // und ließe den Prompt-Wartenden sofort passieren.
  await expect.poll(() => page.evaluate(() => {
    const rows = [...document.querySelectorAll(".xterm-rows > div")];
    return rows.some((row) => /[$#]\s*$/.test(row.textContent ?? ""));
  }), { timeout: 10_000 }).toBe(true);
  await input.press("Control+L");
  // Die Ausgabezeile kann in der E2E-Umgebung an der Cursor-Zelle
  // umbrochen gerendert werden („h" + „ttps://…"). Der Inhalt bleibt dabei
  // vollständig — deshalb prüfen wir die Zeilen ohne Leerraum.
  await input.type(`printf "${marker}\\n"`, { delay: 5 });
  await input.press("Enter");
  await expect.poll(() => page.evaluate((expected) => {
    const text = [...document.querySelectorAll(".xterm-rows > div")].map((row) => row.textContent ?? "").join("");
    return text.replace(/\s+/g, "").includes(expected.replace(/\s+/g, ""));
  }, marker), { timeout: 10_000 }).toBe(true);

  await page.evaluate(() => navigator.clipboard.writeText("http://127.0.0.1:5173/wrapt/"));
  const screen = page.locator(".xterm-screen");
  const box = await screen.boundingBox();
  const cursorTop = await input.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top || "0"));
  expect(box).not.toBeNull();
  const rowY = box!.y + Math.max(6, cursorTop - 7);
  // Der Drag beginnt knapp vor der ersten Zelle: Die Cursor-Zelle am
  // Zeilenanfang (hier das „h") ist schmal gerendert, ab x+8 landet der
  // Start sonst erst in der zweiten Zelle.
  await page.mouse.move(box!.x + 2, rowY);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 2, rowY, { steps: 10 });
  await page.mouse.up();
  await input.press("Control+Shift+C");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(marker);

  const pasteMarker = `__CLIPBOARD_PASTE_${Date.now()}__`;
  await page.evaluate((text) => navigator.clipboard.writeText(`printf '${text}\\n'`), pasteMarker);
  await input.press("Control+Shift+V");
  await input.press("Enter");
  await expect(page.locator(".xterm-screen")).toContainText(pasteMarker, { timeout: 10_000 });
});

test("copies restored scrollback and pastes after route switch and reload", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${workbench}/terminal`);
  await openFirstTerminal(page);
  let pane = page.locator(".terminal-session-pane.is-visible");
  let input = pane.locator(".xterm-helper-textarea");
  const copyMarker = `COPY_RESTORED_${Date.now()}`;
  await input.pressSequentially(
    `printf '${copyMarker}\\n'; for i in $(seq 1 120); do printf 'clipboard-%03d\\n' "$i"; done; printf 'CLIPBOARD_END\\n'`,
  );
  await input.press("Enter");
  await expect(pane.locator(".xterm-screen")).toContainText("CLIPBOARD_END", { timeout: 20_000 });

  await page.locator(".workspace-sidebar").getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.locator(".workspace-sidebar").getByRole("link", { name: "Terminal", exact: true }).click();
  await page.reload();
  await openFirstTerminal(page);
  pane = page.locator(".terminal-session-pane.is-visible");
  input = pane.locator(".xterm-helper-textarea");
  await pane.locator(".terminal-viewport").click();
  await pane.locator(".terminal-viewport").hover();
  await page.mouse.wheel(0, -12_000);

  const markerRow = pane.locator(".xterm-rows > div").filter({ hasText: new RegExp(`^${copyMarker}\\s*$`) });
  await expect(markerRow).toBeVisible();
  const rowBox = await markerRow.boundingBox();
  expect(rowBox).not.toBeNull();
  await page.mouse.move(rowBox!.x + 2, rowBox!.y + rowBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rowBox!.x + rowBox!.width - 2, rowBox!.y + rowBox!.height / 2, { steps: 12 });
  await page.mouse.up();
  await input.press("Control+Shift+C");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(copyMarker);

  const pasteMarker = `PASTE_RESTORED_${Date.now()}`;
  await page.evaluate((text) => navigator.clipboard.writeText(`printf '${text}\\n'`), pasteMarker);
  await input.press("Control+Shift+V");
  await input.press("Enter");
  await expect(pane.locator(".xterm-screen")).toContainText(pasteMarker, { timeout: 20_000 });
});

test("pastes only into the clicked terminal in split view", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`${workbench}/terminal`);
  await openFirstTerminal(page);
  await page.getByRole("complementary", { name: "Terminal-Sidebar" }).getByRole("button", { name: "Neues Terminal rechts teilen", exact: true }).click();
  const panes = page.locator(".terminal-session-pane.is-visible");
  await expect(panes).toHaveCount(2);
  const left = panes.first();
  const right = panes.last();

  const rightMarker = `__PASTE_RIGHT_${Date.now()}__`;
  await right.locator(".terminal-viewport").click();
  await page.evaluate((text) => navigator.clipboard.writeText(`printf '${text}\\n'`), rightMarker);
  await right.locator(".xterm-helper-textarea").press("Control+Shift+V");
  await right.locator(".xterm-helper-textarea").press("Enter");
  await expect(right.locator(".xterm-screen")).toContainText(rightMarker, { timeout: 20_000 });
  await expect(left.locator(".xterm-screen")).not.toContainText(rightMarker);

  const leftMarker = `__PASTE_LEFT_${Date.now()}__`;
  await left.locator(".terminal-viewport").click();
  await expect(left).toHaveClass(/is-focused/);
  await page.evaluate((text) => navigator.clipboard.writeText(`printf '${text}\\n'`), leftMarker);
  await left.locator(".xterm-helper-textarea").press("Control+Shift+V");
  await left.locator(".xterm-helper-textarea").press("Enter");
  await expect(left.locator(".xterm-screen")).toContainText(leftMarker, { timeout: 20_000 });
  await expect(right.locator(".xterm-screen")).not.toContainText(leftMarker);
});

test("keeps VS Code on standard Ctrl+C and Ctrl+V inside the editor frame", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/code-editor`);
  const frameElement = page.locator('iframe[title="Editor"]');
  const editor = page.frameLocator('iframe[title="Editor"]');
  const editorAvailable = await editor.locator(".monaco-workbench").waitFor({ state: "visible", timeout: 25_000 }).then(() => true).catch(() => false);
  test.skip(!editorAvailable, "Kein code-server hinter dieser Instanz erreichbar.");
  const editorInstance = editor.locator(".editor-instance").last();
  const documentAvailable = await editorInstance.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  test.skip(!documentAvailable, "Kein interaktives code-server-Dokument verfügbar.");
  const linesAvailable = await editor.locator(".view-lines").first().waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  test.skip(!linesAvailable, "Kein bearbeitbares code-server-Dokument verfügbar.");
  expect(await frameElement.getAttribute("allow")).toBeNull();
  await expect(editor.locator(".monaco-workbench")).toBeVisible({ timeout: 30_000 });
  await editor.locator("body").press("Control+N");
  const activeEditor = editor.locator(".editor-instance").last();
  // Erst prüfen, ob die neue Instanz ein bearbeitbares Dokument hat —
  // andernfalls überspringen statt endlos auf `.view-lines` zu warten.
  const activeReady = await activeEditor.locator(".view-lines").waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
  test.skip(!activeReady, "Die neue Editor-Instanz hat kein bearbeitbares Dokument.");
  const marker = `__VSCODE_CLIPBOARD_${Date.now()}__`;
  await activeEditor.locator(".view-lines").pressSequentially(marker);
  await activeEditor.locator(".view-lines").press("Control+A");
  await activeEditor.locator(".view-lines").press("Control+C");
  await editor.locator("body").press("Control+N");
  const targetEditor = editor.locator(".editor-instance").last();
  await targetEditor.locator(".view-lines").press("Control+V");
  await expect(targetEditor.locator(".view-lines")).toContainText(marker);
});

test("keeps T3 Code focused so standard Ctrl+C belongs to the embedded app", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/t3-code`);
  const frame = page.locator('iframe[title="T3 Code"]');
  const t3Available = await frame.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  test.skip(!t3Available, "Kein T3-Dienst hinter dieser Instanz erreichbar.");
  expect(await frame.getAttribute("allow")).toBe(
    "local-network-access; local-network; loopback-network",
  );
  await frame.click({ position: { x: 20, y: 20 } });
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("title"))).toBe("T3 Code");
  await page.keyboard.press("Control+C");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("title"))).toBe("T3 Code");
});

test("does not grant embedded previews extra clipboard permissions", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/previews`);
  for (const frame of await page.locator('iframe[title*="Preview"]').all()) {
    expect(await frame.getAttribute("allow")).toBeNull();
  }
});

test("routes Orbit paste to the focused editor, canvas or terminal only", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  test.setTimeout(60_000);
  await resetOrbitTestWorkspace(page, "user@example.com");
  await page.goto(`${workbench}/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await page.getByRole("button", { name: /Neue Notiz/ }).click();
  const note = page.getByLabel("Neue Notiz bearbeiten").last();
  await note.fill("Vorhanden: ");
  const noteMarker = `NOTIZ_${Date.now()}`;
  await page.evaluate((text) => navigator.clipboard.writeText(text), noteMarker);
  await note.press("Control+V");
  await expect(note).toHaveValue(`Vorhanden: ${noteMarker}`);

  const nodesBeforeCanvasPaste = await page.locator(".react-flow__node-orbit").count();
  const canvasMarker = `CANVAS_${Date.now()}`;
  await page.evaluate((text) => navigator.clipboard.writeText(text), canvasMarker);
  // Nahe der Pane-Ecke klicken: Auf einer frischen Fläche liegt die erste
  // Notiz in der Mitte und würde den Klick (und damit den Fokus) abfangen.
  await page.locator(".react-flow__pane").click({ position: { x: 80, y: 60 } });
  await page.keyboard.press("Control+V");
  await expect(page.getByLabel("Eingefügter Text bearbeiten").last()).toHaveValue(canvasMarker);
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(nodesBeforeCanvasPaste + 1);

  await page.locator(".orbit-palette-item").filter({ hasText: /^Terminalziehen$/ }).click();
  const terminal = page.locator('.orbit-live-node [data-panel-type="terminal"]').last();
  // Orbit-Panels laufen im Minimalmodus ohne Tab-Leiste; der Status steht
  // dort in der sr-only-Zeile `.terminal-connection-status`.
  await expect(terminal.locator(".terminal-connection-status")).toHaveText("Verbunden", { timeout: 20_000 });
  await terminal.locator(".xterm-helper-textarea").focus();
  const nodesBeforeTerminalPaste = await page.locator(".react-flow__node-orbit").count();
  const terminalMarker = `__ORBIT_TERMINAL_${Date.now()}__`;
  await page.evaluate((text) => navigator.clipboard.writeText(`printf '${text}\\n'`), terminalMarker);
  // xterm puffert die Eingabe bereits nach „Verbunden“; auf den sichtbaren
  // Shell-Prompt zu warten ist unter kalten PTY-Starts ein unnötiges Rennen.
  await terminal.locator(".xterm-helper-textarea").press("Control+Shift+V");
  await terminal.locator(".xterm-helper-textarea").press("Enter");
  await expect(terminal.locator(".xterm-screen")).toContainText(terminalMarker, { timeout: 20_000 });
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(nodesBeforeTerminalPaste);
});
