import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";
import { resetOrbitTestWorkspace } from "./helpers/orbit";

const workbench = process.env.WRAPT_E2E_URL;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("edits, saves and synchronizes a complete Orbit workspace", async ({ page, browser, browserName }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Orbit test server.");
  const login = `orbit-ui-${browserName}-${testInfo.retry}@example.com`;
  await page.setExtraHTTPHeaders(apiIdentityHeaders(login));
  await resetOrbitTestWorkspace(page, login);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${message.text()} ${message.location()?.url ?? ""}`); });

  await page.goto(`${workbench}/wrapt/orbit`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await expect(page.locator(".orbit-node-status")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".topbar")).toHaveCount(0);

  const projectsResponse = await page.request.get(new URL("/api/v1/projects", workbench).toString(), { headers: apiIdentityHeaders(login) });
  const projectsPayload = await projectsResponse.json() as { projects: Array<{ name: string; availability: string }> };
  const projectName = projectsPayload.projects.find((project) => project.availability === "available")?.name;
  expect(projectName).toBeTruthy();
  await page.getByRole("button", { name: `${projectName} ziehen`, exact: true }).click();
  await expect(page.locator(".orbit-project-node").filter({ hasText: projectName! })).toBeVisible();

  await page.getByRole("button", { name: /Neue Notiz/ }).click();
  const marker = `Orbit synchronisiert ${Date.now()}`;
  const note = page.getByLabel("Neue Notiz bearbeiten").last();
  await expect.poll(() => note.evaluate((element) => getComputedStyle(element).paddingLeft)).toBe("24px");
  await note.fill(marker, { force: true });
  await expect(page.getByRole("status", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  const noteNodeId = await page.locator(".react-flow__node-orbit")
    .filter({ has: note })
    .last()
    .getAttribute("data-id");
  expect(noteNodeId).toBeTruthy();
  const readPersistedNoteContent = async () => {
    const layoutResponse = await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders(login) });
    const layout = await layoutResponse.json();
    const activeBoard = layout.document.boards.find((candidate: { id: string }) => candidate.id === layout.document.activeBoardId);
    const noteNode = activeBoard?.nodes.find((candidate: { id: string; noteId?: string }) => candidate.id === noteNodeId);
    if (!noteNode?.noteId) return "";
    const noteResponse = await page.request.get(
      new URL(`/api/v1/notes/${encodeURIComponent(noteNode.noteId)}`, workbench).toString(),
      { headers: apiIdentityHeaders(login) },
    );
    return noteResponse.ok() ? String((await noteResponse.json()).note.content) : "";
  };
  await expect.poll(readPersistedNoteContent, { timeout: 15_000 }).toContain(marker);
  await page.reload();
  await expect(page.getByLabel("Neue Notiz bearbeiten").last()).toContainText(marker);

  await expect(page.getByRole("button", { name: /To-do-Liste/ })).toBeVisible();

  const initialLayout = await (await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders(login) })).json();
  const initialBoard = initialLayout.document.boards.find((candidate: { id: string }) => candidate.id === initialLayout.document.activeBoardId);
  const projectNode = initialBoard.nodes.find((node: { type: string; title: string }) => node.type === "project" && node.title === projectName);
  const noteNode = initialBoard.nodes.find((node: { id: string }) => node.id === noteNodeId);
  expect(noteNode?.noteId).toBeTruthy();
  const persistedNoteResponse = await page.request.get(
    new URL(`/api/v1/notes/${encodeURIComponent(noteNode.noteId)}`, workbench).toString(),
    { headers: apiIdentityHeaders(login) },
  );
  await expect(persistedNoteResponse).toBeOK();
  expect((await persistedNoteResponse.json()).note.content).toContain(marker);
  const separated = projectNode.position.x + projectNode.size.width < noteNode.position.x
    || noteNode.position.x + noteNode.size.width < projectNode.position.x
    || projectNode.position.y + projectNode.size.height < noteNode.position.y
    || noteNode.position.y + noteNode.size.height < projectNode.position.y;
  expect(separated).toBe(true);

  const secondContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: apiIdentityHeaders(login) });
  const secondPage = await secondContext.newPage();
  await secondPage.goto(`${workbench}/wrapt/orbit`);
  const secondNote = secondPage.getByLabel("Neue Notiz bearbeiten").last();
  await expect(secondNote).toContainText(marker);
  const remoteMarker = `${marker} · Gerät 2`;
  await secondNote.fill(remoteMarker, { force: true });
  await expect(secondPage.getByRole("status", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  await page.bringToFront();
  await expect(page.getByLabel("Neue Notiz bearbeiten").last()).toContainText(remoteMarker, { timeout: 12_000 });

  const nodeCount = await page.locator(".react-flow__node-orbit").count();
  await page.getByRole("button", { name: /Neuer Bereich/ }).dragTo(page.locator(".react-flow__pane"), {
    // Der Pane-Target beginnt hinter der Sidebar. 200 Pixel würden den
    // breiten Frame unter die Sidebar schieben und den Drag-Handle verdecken.
    targetPosition: { x: 650, y: 500 },
  });
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(nodeCount + 1);
  const frameCandidate = page.locator(".react-flow__node-orbit").filter({ has: page.locator(".orbit-frame-node") }).last();
  await expect(frameCandidate).toBeVisible();
  const frameId = await frameCandidate.getAttribute("data-id");
  expect(frameId).toBeTruthy();
  const frameNode = page.locator(`.react-flow__node-orbit[data-id="${frameId}"]`);
  const frameTitleLocator = frameNode.locator(".orbit-frame-title");
  const frameTitleBackground = await frameTitleLocator.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(frameTitleBackground).not.toBe("rgba(0, 0, 0, 0)");
  await expect(page.getByRole("button", { name: "Eigenschaften öffnen" })).toBeVisible();
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Eigenschaften öffnen" }).click();
  await expect(page.locator(".orbit-inspector")).toBeVisible();
  await page.getByRole("button", { name: "Eigenschaften einklappen" }).click();
  await page.waitForTimeout(300);
  const frameBeforeDrag = await frameNode.boundingBox();
  if (browserName !== "firefox") {
    // Der große Eckgriff liegt bei kleinen Zoomstufen über dem linken Teil
    // des Frame-Titels. Force-Hover setzt den Drag-Handle trotzdem gezielt,
    // ohne einen zufälligen Resize-Griff als Ziel zu wählen.
    await frameTitleLocator.hover({ force: true });
    const frameTitle = await frameTitleLocator.boundingBox();
    expect(frameTitle).not.toBeNull();
    const dragPoint = { x: (frameTitle?.x ?? 0) + (frameTitle?.width ?? 0) / 2, y: (frameTitle?.y ?? 0) + (frameTitle?.height ?? 0) / 2 };
    await page.mouse.move(dragPoint.x, dragPoint.y);
    await page.mouse.down();
    await page.mouse.move(dragPoint.x + 80, dragPoint.y + 40, { steps: 8 });
    await page.mouse.up();
    await page.mouse.up();
    const frameAfterDrag = await frameNode.boundingBox();
    expect(frameAfterDrag?.x).toBeGreaterThan((frameBeforeDrag?.x ?? 0) + 30);
  }
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  const snippetPalette = page.getByRole("button", { name: /Code-Snippet/ });
  await snippetPalette.press("Enter");
  const snippetNode = page.locator(".react-flow__node-orbit").filter({ has: page.locator(".orbit-snippet-meta") }).last();
  await expect(snippetNode).toBeVisible();
  await snippetNode.getByLabel("Programmiersprache").fill("typescript");
  await snippetNode.getByLabel("Code-Snippet Code bearbeiten").fill("const orbit = true;", { force: true });
  await page.getByRole("button", { name: /Codex Nutzung/ }).press("Enter");
  await expect(page.getByText("Aktualisierung alle 30 Sekunden").last()).toBeVisible();

  await expect(page.getByRole("button", { name: /neue-datei\.ts/ })).toHaveCount(0);

  await page.keyboard.press("/");
  const command = page.getByRole("dialog", { name: "Orbit-Befehl" });
  await expect(command).toBeVisible();
  await command.getByPlaceholder("Terminal, Notiz oder Projekt…").fill("terminal");
  await command.getByPlaceholder("Terminal, Notiz oder Projekt…").press("Enter");
  const terminalNode = page.locator(".react-flow__node-orbit").filter({ has: page.locator('[data-panel-type="terminal"]') }).last();
  await terminalNode.getByRole("button", { name: "Terminal öffnen" }).click();
  const terminalInput = page.locator(".xterm-helper-textarea").last();
  await expect(page.locator(".xterm-screen").last()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".terminal-connection-status").last()).toHaveText("Verbunden", { timeout: 20_000 });
  await expect(terminalInput).toBeAttached();

  await expect(terminalNode.locator(".terminal-area-toolbar")).toHaveCount(0);
  await expect(terminalNode.locator(".panel-island")).toHaveCount(0);
  await expect(terminalNode.locator(".orbit-live-dragbar")).toHaveCount(0);
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);
  await expect(terminalNode.locator(".orbit-resize-corner")).toHaveCount(8);
  const beforeResize = await terminalNode.boundingBox();
  const resizeHandle = terminalNode.locator(".react-flow__resize-control.handle.bottom.right");
  const resizeHandleBox = await resizeHandle.boundingBox();
  expect(resizeHandleBox).not.toBeNull();
  expect(resizeHandleBox?.width).toBeLessThanOrEqual(40);
  expect(resizeHandleBox?.height).toBeLessThanOrEqual(40);
  expect(resizeHandleBox?.width).toBeGreaterThan(10);
  expect(resizeHandleBox?.height).toBeGreaterThan(10);
  await resizeHandle.hover({ force: true });
  const resizeRect = await resizeHandle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const resizeX = resizeRect.x + resizeRect.width / 2;
  const resizeY = resizeRect.y + resizeRect.height / 2;
  const hitClass = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, { x: resizeX, y: resizeY });
  expect(String(hitClass)).toContain("react-flow__resize-control");
  await page.mouse.move(resizeX, resizeY);
  await page.mouse.down();
  await page.mouse.move(resizeX + 120, resizeY + 90, { steps: 12 });
  await page.mouse.up();
  const afterResize = await terminalNode.boundingBox();
  expect(afterResize?.width).toBeGreaterThan((beforeResize?.width ?? 0) + 40);
  expect(afterResize?.height).toBeGreaterThan((beforeResize?.height ?? 0) + 30);
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);

  const zoomRow = await page.locator(".orbit-zoom-row").boundingBox();
  const lastZoomButton = await page.getByRole("button", { name: "Alles zeigen" }).boundingBox();
  expect(zoomRow).not.toBeNull();
  expect(lastZoomButton).not.toBeNull();
  expect(zoomRow!.width).toBeLessThan(150);
  expect((zoomRow!.x + zoomRow!.width) - (lastZoomButton!.x + lastZoomButton!.width)).toBeLessThanOrEqual(6);

  const edgeCountBeforeFrameConnection = await page.locator(".react-flow__edge").count();
  const sourceHandleBox = await terminalNode.locator(".orbit-handle").last().boundingBox();
  const frameConnectionPoint = await frameNode.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 56; y < bounds.bottom - 24; y += 32) {
      for (let x = bounds.left + 56; x < bounds.right - 24; x += 32) {
        const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>(".react-flow__node-orbit");
        if (hit === element) return { x, y };
      }
    }
    return null;
  });
  expect(frameConnectionPoint).not.toBeNull();
  await page.mouse.move((sourceHandleBox?.x ?? 0) + (sourceHandleBox?.width ?? 0) / 2, (sourceHandleBox?.y ?? 0) + (sourceHandleBox?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move(frameConnectionPoint?.x ?? 0, frameConnectionPoint?.y ?? 0, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCountBeforeFrameConnection + 1);

  await page.locator(".orbit-palette-item").filter({ hasText: /^Codexziehen$/ }).press("Enter");
  await expect(page.locator('.orbit-live-node [data-panel-type="codex"]').last()).toBeVisible();
  await page.route("**/opencode", (route) => route.fulfill({
    status: 503,
    contentType: "text/plain; charset=utf-8",
    body: "OpenCode Web ist derzeit nicht erreichbar.",
  }));
  await page.locator(".orbit-palette-item").filter({ hasText: /^OpenCodeziehen$/ }).press("Enter");
  const openCodePanel = page.locator('.orbit-live-node [data-panel-type="opencode"]').last();
  await expect(openCodePanel).toBeVisible();
  const openCodeFrame = openCodePanel.locator('iframe[title="OpenCode"]');
  await expect(openCodeFrame).toHaveAttribute("src", /\/opencode(?:\?|$)/);
  await expect(openCodeFrame.contentFrame().locator("body")).toContainText("OpenCode Web ist derzeit nicht erreichbar.");
  await page.keyboard.press("/");
  const t3Command = page.getByRole("dialog", { name: "Orbit-Befehl" });
  await t3Command.getByPlaceholder("Terminal, Notiz oder Projekt…").fill("t3 code");
  await t3Command.getByPlaceholder("Terminal, Notiz oder Projekt…").press("Enter");
  const t3Node = page.locator(".react-flow__node-orbit").filter({ has: page.locator('iframe[title="T3 Code"]') }).last();
  await expect(t3Node.locator('iframe[title="T3 Code"]')).toHaveAttribute("src", /(?:\/t3|https?:\/\/)/);
  await expect(t3Node.locator(".panel-island")).toHaveCount(0);

  const boardSwitcher = page.locator(".orbit-board-picker-trigger");
  await expect(page.getByLabel("Gespeicherte Szene öffnen")).toHaveCount(0);
  await page.getByRole("button", { name: "Arbeitsfläche umbenennen" }).click();
  const renamedBoard = `Fokus ${Date.now()}`;
  await page.getByLabel("Name der Arbeitsfläche").fill(renamedBoard);
  await page.getByRole("button", { name: "Arbeitsfläche umbenennen speichern" }).click();
  await expect(boardSwitcher).toHaveAttribute("aria-label", `Arbeitsfläche: ${renamedBoard}`);
  await expect(page.getByRole("status", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  await boardSwitcher.click();
  const boardMenu = page.getByRole("menu", { name: "Arbeitsfläche auswählen" });
  await expect(boardMenu).toBeVisible();
  const boardMenuBounds = await boardMenu.boundingBox();
  expect(boardMenuBounds).not.toBeNull();
  expect(boardMenuBounds!.x).toBeGreaterThanOrEqual(0);
  expect(boardMenuBounds!.y).toBeGreaterThanOrEqual(0);
  expect(boardMenuBounds!.x + boardMenuBounds!.width).toBeLessThanOrEqual(1440);
  expect(boardMenuBounds!.y + boardMenuBounds!.height).toBeLessThanOrEqual(960);
  const boardCount = await page.getByRole("menuitemradio").count();
  await page.keyboard.press("Escape");
  const readBoardCount = async () => Number((await (await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders(login) })).json()).document.boards.length);
  await page.getByRole("button", { name: "Arbeitsfläche hinzufügen" }).click();
  await boardSwitcher.click();
  await expect(page.getByRole("menuitemradio")).toHaveCount(boardCount + 1);
  await expect(page.locator(".orbit-live-node")).toHaveCount(0);
  await expect.poll(readBoardCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(boardCount + 1);
  const afterBoardSave = await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders(login) });
  expect((await afterBoardSave.json()).document.boards.length).toBeGreaterThanOrEqual(2);
  await page.getByRole("menuitemradio").filter({ hasText: renamedBoard }).click();
  await expect(page.locator(".orbit-live-node")).not.toHaveCount(0);
  await expect(boardSwitcher).toHaveAttribute("aria-label", `Arbeitsfläche: ${renamedBoard}`);
  await boardSwitcher.click();
  await expect(page.getByRole("menuitemradio", { checked: true })).toHaveCount(1);
  await page.getByRole("menuitemradio").filter({ hasText: "Arbeitsfläche 2" }).click();
  await expect(boardSwitcher).toHaveAttribute("aria-label", "Arbeitsfläche: Arbeitsfläche 2");
  await page.getByRole("button", { name: "Arbeitsfläche entfernen" }).click();
  await expect(boardSwitcher).toHaveAttribute("aria-label", `Arbeitsfläche: ${renamedBoard}`);
  await expect.poll(readBoardCount, { timeout: 15_000 }).toBe(boardCount);

  const noteCountBeforeDelete = await page.locator(".orbit-node-shell").count();
  await page.getByRole("button", { name: "Neue Notiz", exact: true }).click();
  const deletableNote = page.locator(".orbit-node-shell").last();
  const dragHeader = deletableNote.locator(".orbit-node-header");
  if (browserName !== "chromium") {
    await dragHeader.click();
    await page.keyboard.press("Delete");
  } else {
    // Nach dem Boardwechsel kann der React-Flow-Auswahlzustand noch
    // auf dem vorherigen Knoten liegen. Ein expliziter Klick macht den
    // Drag-Handle aktiv; danach muss die automatische Canvas-Bewegung enden.
    await dragHeader.click();
    await page.getByRole("button", { name: "Alles zeigen" }).click();
    await dragHeader.hover({ force: true });
    await expect.poll(async () => {
      const before = await dragHeader.boundingBox();
      await page.waitForTimeout(80);
      const after = await dragHeader.boundingBox();
      return Boolean(before && after && Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1);
    }).toBe(true);
    const dragStart = await dragHeader.evaluate((header) => {
      const rect = header.getBoundingClientRect();
      for (const yFraction of [0.75, 0.6, 0.9]) {
        for (const xFraction of [0.3, 0.4, 0.6, 0.7, 0.5]) {
          const x = rect.left + rect.width * xFraction;
          const y = rect.top + rect.height * yFraction;
          if (document.elementFromPoint(x, y)?.closest(".orbit-node-header") === header) return { x, y };
        }
      }
      return null;
    });
    expect(dragStart).not.toBeNull();
    await page.mouse.move(dragStart!.x, dragStart!.y);
    await page.mouse.down();
    await page.mouse.move(dragStart!.x + 28, dragStart!.y + 24, { steps: 4 });
    await expect(page.locator(".orbit-delete-zone")).toHaveClass(/is-visible/);
    const deleteZoneBox = await page.locator(".orbit-delete-zone").boundingBox();
    expect(deleteZoneBox).not.toBeNull();
    await page.mouse.move((deleteZoneBox?.x ?? 0) + (deleteZoneBox?.width ?? 0) / 2, (deleteZoneBox?.y ?? 0) + (deleteZoneBox?.height ?? 0) / 2, { steps: 12 });
    await expect(page.locator(".orbit-delete-zone")).toHaveClass(/is-armed/);
    await page.mouse.up();
  }
  await expect(page.locator(".orbit-node-shell")).toHaveCount(noteCountBeforeDelete);

  const edgeCount = await page.locator(".react-flow__edge").count();
  await page.locator(".react-flow__edge-interaction").first().evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 720, clientY: 420 }));
  });
  const edgeMenu = page.getByRole("dialog", { name: "Verbindung bearbeiten" });
  await expect(edgeMenu).toBeVisible();
  await edgeMenu.getByRole("button", { name: "Löschen" }).evaluate((button) => button.click());
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCount - 1);

  const viewport = page.locator(".react-flow__viewport");
  const viewportTransformBefore = await viewport.getAttribute("style");
  const emptyPanePoint = await page.locator(".orbit-page").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 140; y < bounds.bottom - 110; y += 36) {
      for (let x = bounds.left + 36; x < bounds.right - 36; x += 36) {
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
      }
    }
    return null;
  });
  expect(emptyPanePoint).not.toBeNull();
  await page.mouse.move(emptyPanePoint?.x ?? 0, emptyPanePoint?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move((emptyPanePoint?.x ?? 0) + 60, (emptyPanePoint?.y ?? 0) + 50, { steps: 8 });
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute("style", viewportTransformBefore ?? "");
  await expect(page.locator(".react-flow__selection")).toHaveCount(0);

  await page.screenshot({ path: "/tmp/orbit-board-e2e.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".orbit-main-island")).toBeVisible();
  const addButton = page.getByRole("button", { name: "Befehl" });
  await expect(addButton).toBeVisible();
  const addButtonBox = await addButton.boundingBox();
  expect(addButtonBox?.width).toBeGreaterThanOrEqual(44);
  expect(addButtonBox?.height).toBeGreaterThanOrEqual(44);
  const mobileNodeCount = await page.locator(".react-flow__node-orbit").count();
  await addButton.click();
  const mobilePalette = page.getByRole("dialog", { name: "Orbit-Befehl" });
  await expect(mobilePalette).toBeVisible();
  const paletteBox = await mobilePalette.boundingBox();
  expect(Math.round((paletteBox?.y ?? 0) + (paletteBox?.height ?? 0))).toBeGreaterThanOrEqual(842);
  await mobilePalette.getByPlaceholder("Terminal, Notiz oder Projekt…").fill("notiz");
  await mobilePalette.getByRole("button", { name: /Neue Notiz/ }).click();
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(mobileNodeCount + 1);
  const mobileBounds = await page.locator(".orbit-page").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(mobileBounds.scrollWidth).toBeLessThanOrEqual(mobileBounds.clientWidth);
  expect(mobileBounds.scrollHeight).toBeLessThanOrEqual(mobileBounds.clientHeight);

  const orbitResponse = await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders(login) });
  await expect(orbitResponse).toBeOK();
  const orbit = await orbitResponse.json();
  expect(orbit.revision).toBeGreaterThan(0);
  expect(orbit.document.version).toBe(8);
  expect(orbit.document.boards.length).toBe(boardCount);
  expect(orbit.document.boards.some((candidate: { edges: unknown[] }) => candidate.edges.length > 0)).toBe(true);

  await secondContext.close();
  const isolatedLocalOrigin = new URL(workbench).hostname === "127.0.0.1";
  expect(errors.filter((message) => {
    if (/favicon|ResizeObserver loop/i.test(message)) return false;
    if (/Cookie .*_cfuvid.*rejected for invalid domain.*clerk\.t3\.codes/i.test(message)) return false;
    if (isolatedLocalOrigin && /invalid source: 'http:\/\/\[::1\]:3010'/i.test(message)) return false;
    if (isolatedLocalOrigin && /ws:\/\/127\.0\.0\.1:\d+\/api\/v1\/(?:editor|notifications)\/ws/i.test(message)) return false;
    if (isolatedLocalOrigin && /Framing .*server-name.*frame-ancestors|frame-ancestors.*violates|status of 400|ws:\/\/127\.0\.0\.1:\d+\/api\/v1\/terminal/i.test(message)) return false;
    if (isolatedLocalOrigin && /server-name\.tailnet\.ts\.net/i.test(message)) return false;
    // Die isolierte Instanz hat weder Codexbar noch echte Konten: Die
    // Nutzungs-Panels dürfen dort mit 500 antworten, ohne den Lauf zu färben.
    if (isolatedLocalOrigin && /status of 500.*\/api\/v1\/usage/i.test(message)) return false;
    // Ebenso fehlen der isolierten Instanz die echten Agent-Dienste hinter
    // /t3, /opencode und /codex. Die Proxys melden das als 502/503.
    if (isolatedLocalOrigin && /status of (?:500|502|503).*\/(?:t3|opencode|codex)(?:\?|$)/i.test(message)) return false;
    return true;
  })).toEqual([]);
});
