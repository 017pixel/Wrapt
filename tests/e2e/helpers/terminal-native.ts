import type { Page, WebSocketRoute } from "@playwright/test";

function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function openTerminal(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator(".terminal-tree-row.is-entry,.terminal-empty-state button").first().waitFor();
  const empty = page.locator(".terminal-empty-state button");
  if (await empty.isVisible()) await empty.click();
  await page.locator(".is-visible .terminal-session[data-status=connected]").waitFor();
}

async function scrollTerminal(page: Page): Promise<void> {
  const screen = page.locator(".is-visible .xterm-screen");
  const before = await screen.innerText();
  const box = await screen.boundingBox();
  ensure(box, "Terminalfläche fehlt");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.wheel(0, -250);
  await page.waitForFunction((text) => document.querySelector<HTMLElement>(".is-visible .xterm-screen")?.innerText !== text, before);
}

async function processIds(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch("/api/v1/terminal/sessions");
    if (!response.ok) throw new Error(`Sitzungsabfrage: ${response.status}`);
    const body = await response.json() as { sessions: Array<{ id: string; pid: number }> };
    return JSON.stringify(body.sessions.map(({ id, pid }) => ({ id, pid })).sort((left, right) => left.id.localeCompare(right.id)));
  });
}

async function createScrollback(page: Page): Promise<void> {
  const input = page.locator(".is-visible .xterm-helper-textarea");
  await input.fill("for i in $(seq 1 300); do printf 'NATIVE_ROW %s\\n' \"$i\"; done");
  await input.press("Enter");
  await page.waitForFunction(() => document.querySelector(".is-visible .xterm-screen")?.textContent?.includes("NATIVE_ROW 300"));
}

/** Derselbe Ablauf läuft in CI und im Playwright-MCP-Verifikationslauf. */
export async function verifyTerminalReentry(page: Page, url: string) {
  await openTerminal(page, url);
  await createScrollback(page);
  const ids = await processIds(page);
  const original = await page.locator(".is-visible .xterm").elementHandle();
  ensure(original, "Renderer fehlt");
  await scrollTerminal(page);
  const scrolled = await page.locator(".is-visible .xterm-screen").innerText();
  await page.getByRole("button", { name: "Terminal öffnen", exact: true }).first().click();
  await page.locator(".is-visible .terminal-session[data-status=connected]").waitFor();
  const twoProcesses = await processIds(page);
  ensure(twoProcesses !== ids, "Zweite Sitzung wurde nicht erstellt");
  await page.locator(".terminal-tree-row.is-entry").first().click();
  await page.locator(".is-visible .terminal-session[data-status=connected]").waitFor();
  ensure(await original.evaluate((element) => element.isConnected), "Sitzungswechsel hat den Renderer zerstört");
  ensure(await page.locator(".is-visible .xterm-screen").innerText() === scrolled, "Scrollposition beim Wechsel verloren");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("link", { name: "Terminal", exact: true }).click();
  await page.locator(".is-visible .terminal-session[data-status=connected]").waitFor();
  await scrollTerminal(page);
  await page.getByRole("button", { name: "Weitere Terminalaktionen", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pane schließen", exact: true }).click();
  await page.locator(".terminal-empty-state").waitFor();
  await page.locator(".terminal-tree-row.is-entry").first().click();
  await page.locator(".is-visible .terminal-session[data-status=connected]").waitFor();
  await scrollTerminal(page);
  await page.goto("about:blank");
  await openTerminal(page, url);
  await scrollTerminal(page);
  ensure(await processIds(page) === twoProcesses, "Wiederöffnung hat laufende Sitzungen verändert");
  return { rendererRetained: true, scrollAfterToolReturn: true, scrollAfterPaneReopen: true, scrollAfterWebsiteReopen: true, processesRetained: true };
}

export async function verifyTerminalWake(page: Page, url: string) {
  let current: { route: WebSocketRoute; blackhole: boolean } | undefined;
  let connections = 0;
  await page.routeWebSocket("**/api/v1/terminal", (route) => {
    const server = route.connectToServer();
    const state = { route, blackhole: false };
    current = state;
    connections++;
    route.onMessage((data) => { if (!state.blackhole) server.send(data); });
    server.onMessage((data) => { if (!state.blackhole) route.send(data); });
  });
  await openTerminal(page, url);
  await createScrollback(page);
  const ids = await processIds(page);
  const before = connections;
  ensure(current, "Socket fehlt");
  current.blackhole = true;
  // Der Browser ist zurück, während TCP den alten Socket noch für offen hält.
  await page.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 60_000;
    document.dispatchEvent(new Event("visibilitychange"));
    Date.now = now;
  });
  for (let attempt = 0; connections === before && attempt < 150; attempt++) await page.waitForTimeout(20);
  await page.locator(".is-visible .terminal-session[data-status=connected]").waitFor();
  ensure(connections === before + 1, "Standby hat den veralteten Socket nicht ersetzt");
  await scrollTerminal(page);
  ensure(await processIds(page) === ids, "Standby hat Prozesse verändert");
  return { wakeRecovered: true, scrollImmediately: true, processesRetained: true };
}

export async function verifyTerminalScrollFlood(page: Page, url: string) {
  let connections = 0;
  const inputFrames: string[] = [];
  await page.routeWebSocket("**/api/v1/terminal", (route) => {
    const server = route.connectToServer();
    connections++;
    route.onMessage((data) => {
      const message = JSON.parse(String(data)) as { type: string; data?: string };
      if (message.type === "terminal.input") inputFrames.push(message.data ?? "");
      server.send(data);
    });
  });
  await openTerminal(page, url);
  // Die Marker entstehen erst im Programm, nicht schon durch das Shell-Echo.
  const python = [
    "import os,sys,termios,tty,time,select", "old=termios.tcgetattr(0)", "tty.setraw(0)",
    'sys.stdout.write("\\x1b[?1049h\\x1b[?1000h\\x1b[?1006h"+"NATIVE_"+"FLOOD_READY\\r\\n");sys.stdout.flush()',
    "end=time.monotonic()+7; total=0", "try:", " while time.monotonic()<end:",
    "  if select.select([0],[],[],0.05)[0]: total+=len(os.read(0,65536))", "finally:",
    ' sys.stdout.write("\\x1b[?1000l\\x1b[?1006l\\x1b[?1049l");sys.stdout.flush();termios.tcsetattr(0,termios.TCSANOW,old);print("NATIVE_"+"FLOOD_DONE",total)',
  ].join("\n");
  await page.locator(".is-visible .xterm-helper-textarea").fill(`python3 -c 'exec(${JSON.stringify(python)})'`);
  await page.locator(".is-visible .xterm-helper-textarea").press("Enter");
  await page.waitForFunction(() => document.querySelector(".is-visible .xterm-screen")?.textContent?.includes("NATIVE_FLOOD_READY"));
  const before = connections;
  const frameStart = inputFrames.length;
  await page.locator(".is-visible .xterm-screen").evaluate(async (screen) => {
    const box = screen.getBoundingClientRect();
    for (let index = 0; index < 500; index++) {
      screen.dispatchEvent(new WheelEvent("wheel", { deltaY: index < 250 ? -18 : 18, clientX: box.x + 100, clientY: box.y + 100, bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
  });
  await page.waitForFunction(() => document.querySelector(".is-visible .xterm-screen")?.textContent?.includes("NATIVE_FLOOD_DONE"));
  const frames = inputFrames.slice(frameStart);
  const sent = frames.join("").length;
  const text = await page.locator(".is-visible .xterm-screen").innerText();
  const received = Number(text.match(/NATIVE_FLOOD_DONE\s+(\d+)/)?.[1]);
  ensure(connections === before, "Scrollflut hat den Socket getrennt");
  ensure(frames.length > 0 && frames.length < 100, `Scrollen erzeugte ${frames.length} Nachrichten`);
  ensure(sent === received, `Eingabeverlust: ${sent} gesendet, ${received} empfangen`);
  ensure(await page.locator(".terminal-session [role=alert]").count() === 0, "Fehler verschiebt die Terminalfläche");
  return { wheelEvents: 500, frames: frames.length, sent, received, connectionRetained: true };
}
