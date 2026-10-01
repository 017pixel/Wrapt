#!/usr/bin/env node
// Nimmt die Landingpage-Screenshots der isolierten Screenshot-Instanz auf.
// Läuft nur gegen die Fixture-Instanz (Default-Port 3410) und schreibt die
// fertigen PNGs nach "Landing Page/assets/".
import { execFileSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { warmMetricsHistory } from "./lib/screenshot-metrics-warmup.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Standard bleiben die Landingpage-Assets. Für die Dokumentation wird nur das
// Zielverzeichnis umgelenkt, damit die Landingpage-Dateien unangetastet bleiben.
const assetsDirectory = process.env.WRAPT_SCREENSHOT_OUT_DIR
  ? resolve(process.env.WRAPT_SCREENSHOT_OUT_DIR)
  : join(repositoryRoot, "Landing Page", "assets");
const basePort = Number(process.env.WRAPT_SCREENSHOT_PORT ?? 3410);
const baseUrl = `http://127.0.0.1:${basePort}`;
const identity = "screenshot@example.com";

function parseViewport(value, fallback) {
  const match = /^\s*(\d{2,5})\s*[x×]\s*(\d{2,5})\s*$/.exec(value ?? "");
  if (!match) return fallback;
  return { width: Number(match[1]), height: Number(match[2]) };
}

const desktopViewport = parseViewport(process.env.WRAPT_SCREENSHOT_VIEWPORT, { width: 1440, height: 900 });
const mobileViewport = { width: 390, height: 844 };

await mkdir(assetsDirectory, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: desktopViewport,
  deviceScaleFactor: 2,
  colorScheme: "dark",
  reducedMotion: "no-preference",
  extraHTTPHeaders: { "tailscale-user-login": identity },
});
context.route("**/api/v1/server/summary*", async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  // Der reale Hostname gehört nicht in ein öffentliches Bild.
  if (payload && typeof payload === "object") payload.serverName = "demo-server";
  await route.fulfill({ response, json: payload });
});

const page = await context.newPage();
const results = [];

function waitApi(pathPart, timeout = 20_000) {
  return page.waitForResponse((response) => response.url().includes(`/api/v1${pathPart}`), { timeout }).catch(() => undefined);
}

async function open(path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
}

async function shoot(name, width, height) {
  const target = join(assetsDirectory, `${name}.png`);
  await page.screenshot({ path: target });
  execFileSync("sips", ["-z", String(height), String(width), target], { stdio: "ignore" });
  const info = await stat(target);
  results.push({ name, bytes: info.size, width, height });
  console.log(`  ${name}.png (${width}x${height})`);
}

async function focusTerminal() {
  const screen = page.locator(".xterm-screen").last();
  if ((await screen.count()) === 0) return false;
  await screen.click({ position: { x: 120, y: 60 } }).catch(() => undefined);
  await page.waitForTimeout(200);
  return true;
}

async function typeCommand(command) {
  await page.keyboard.type(command, { delay: 15 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
}

async function captureDashboard(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  // Der Verlauf muss vor dem ersten Abruf stehen: Das Dashboard lädt die
  // Messwerte nur einmal beim Seitenaufbau.
  const cpuHistory = await warmMetricsHistory({ baseUrl });
  console.log(`  Verlauf aufgewärmt: ${cpuHistory.length} Messpunkte`);
  const summary = waitApi("/server/summary");
  const metrics = waitApi("/server/metrics");
  const projects = waitApi("/projects");
  await open("/wrapt/");
  await Promise.all([summary, metrics, projects]);
  await page.waitForTimeout(3_000);
  await page.evaluate(() => globalThis.window.scrollTo(0, 0));
  // Leicht scrollen, damit auch die Dienstliste unter „Zuletzt aktiv“ sichtbar ist.
  await page.mouse.move(900, 500);
  await page.mouse.wheel(0, 60);
  await page.waitForTimeout(400);
  await shoot(options.output ?? "wrapt-dashboard", viewport.width, viewport.height);
}

async function resetTerminalWorkspace() {
  await page.evaluate(async () => {
    const headers = { accept: "application/json", "tailscale-user-login": "screenshot@example.com" };
    const sessions = await (await fetch("/api/v1/terminal/sessions", { headers, credentials: "same-origin" })).json();
    for (const session of sessions.sessions ?? []) {
      await fetch(`/api/v1/terminal/sessions/${session.id}`, { method: "DELETE", headers, credentials: "same-origin" });
    }
    const workspace = await (await fetch("/api/v1/terminal/workspace", { headers, credentials: "same-origin" })).json();
    await fetch("/api/v1/terminal/workspace", {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json", "x-wrapt-sync-version": "2" },
      credentials: "same-origin",
      body: JSON.stringify({ document: { version: 2, entries: [], folders: [], areaLayouts: {} }, expectedRevision: workspace.revision }),
    });
  });
}

async function renameTerminalEntries(names) {
  await page.evaluate(async (targetNames) => {
    const headers = { accept: "application/json", "tailscale-user-login": "screenshot@example.com" };
    const workspace = await (await fetch("/api/v1/terminal/workspace", { headers, credentials: "same-origin" })).json();
    const entries = [...(workspace.document.entries ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);
    const operations = entries.slice(0, targetNames.length).map((entry, index) => ({ type: "updateEntry", id: entry.id, patch: { name: targetNames[index] } }));
    if (operations.length === 0) return;
    await fetch("/api/v1/terminal/workspace/ops", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "x-wrapt-sync-version": "2" },
      credentials: "same-origin",
      body: JSON.stringify({ expectedRevision: workspace.revision, operations }),
    });
  }, names);
}

async function openTerminalSession(commands) {
  await page.getByRole("button", { name: "Terminal öffnen" }).first().click().catch(() => undefined);
  await page.waitForSelector(".xterm", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  if (await focusTerminal()) {
    for (const command of commands) await typeCommand(command);
  }
}

async function captureTerminal(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  const sessions = waitApi("/terminal/sessions");
  await open("/wrapt/terminal");
  await sessions;
  await page.waitForTimeout(1200);
  // Sauberer Ausgangszustand: alle Fixture-Sitzungen und Workspace-Einträge weg.
  await resetTerminalWorkspace();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await openTerminalSession(["clear", "git log --oneline -3", "ls -la", "node --version"]);
  await openTerminalSession(["clear", "ls", "node --version", "git log --oneline -1"]);
  await page.waitForTimeout(1000);
  await renameTerminalEntries(["Nordlicht", "Feldnotiz"]);
  // Der Workspace-Sync pollt alle 3 s und übernimmt die Umbenennung.
  await page.waitForTimeout(4000);
  // Der cwd-Zusatz würde den langen Temp-Pfad zeigen; für das Motiv blenden wir ihn aus.
  await page.addStyleTag({ content: ".terminal-tree-cwd { display: none !important; }" });
  await page.waitForTimeout(300);
  await shoot(options.output ?? "wrapt-terminal", viewport.width, viewport.height);
}

async function capturePreviews(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  const servers = waitApi("/previews/dev-servers/nordlicht");
  await open("/wrapt/previews");
  await servers;
  await page.waitForTimeout(2500);
  await shoot(options.output ?? "wrapt-previews", viewport.width, viewport.height);
}

async function capturePlugins(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  await open("/wrapt/plugins");
  await page.waitForTimeout(1500);
  await page.getByText("Installieren", { exact: true }).first().click().catch(() => undefined);
  await page.waitForTimeout(1500);
  await shoot(options.output ?? "wrapt-plugins", viewport.width, viewport.height);
}

async function captureThemes(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  await open("/wrapt/settings");
  await page.waitForTimeout(1500);
  await page.getByText("Design", { exact: true }).first().click().catch(() => undefined);
  await page.waitForSelector("#settings-design-themes", { timeout: 10_000 }).catch(() => undefined);
  const card = page.locator('[data-theme-id="t3-code"]');
  if (await card.count() && (await card.getAttribute("aria-pressed")) !== "true") {
    await card.click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  // Den Theme-Abschnitt zentrieren, damit das Raster den Hauptteil des Bildes füllt.
  await page.locator("#settings-design-themes").evaluate((element) => element.scrollIntoView({ block: "center" })).catch(() => undefined);
  await page.waitForTimeout(400);
  // Etwas zurück, damit die Überschrift „Vorgefertigte Themes“ vollständig sichtbar bleibt.
  await page.mouse.move(720, 500);
  await page.mouse.wheel(0, -80);
  await page.waitForTimeout(400);
  await shoot(options.output ?? "wrapt-themes", viewport.width, viewport.height);
}

async function captureSimpleRoute(route, options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  await open(route);
  await page.waitForTimeout(options.waitMs ?? 2000);
  await shoot(options.output ?? "wrapt-simple", viewport.width, viewport.height);
}

async function captureUsage(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  const dashboard = waitApi("/usage/dashboard", 25_000);
  await open("/wrapt/usage");
  await dashboard;
  await page.waitForTimeout(2500);
  await shoot(options.output ?? "wrapt-usage", viewport.width, viewport.height);
}

async function captureNotes(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  const notes = waitApi("/notes");
  await open("/wrapt/notizen");
  await notes;
  await page.waitForTimeout(1500);
  await page.getByText("Release 1.23 vorbereiten", { exact: true }).first().click().catch(() => undefined);
  await page.waitForTimeout(800);
  await shoot(options.output ?? "wrapt-notes", viewport.width, viewport.height);
}

async function captureOrbit(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  const orbit = waitApi("/orbit");
  await open("/wrapt/orbit");
  await orbit;
  await page.waitForTimeout(2500);
  await shoot(options.output ?? "wrapt-orbit", viewport.width, viewport.height);
}

async function captureMobile(options = {}) {
  const viewport = options.viewport ?? mobileViewport;
  await page.setViewportSize(viewport);
  // Auch mobil lädt das Dashboard die Messwerte einmalig; Verlauf frisch halten.
  await warmMetricsHistory({ baseUrl });
  const summary = waitApi("/server/summary");
  await open("/wrapt/");
  await summary;
  await page.waitForTimeout(3_000);
  await page.evaluate(() => globalThis.window.scrollTo(0, 0));
  await shoot(options.output ?? "wrapt-mobil", viewport.width, viewport.height);
}

async function captureMobileNotes(options = {}) {
  const viewport = options.viewport ?? mobileViewport;
  await page.setViewportSize(viewport);
  const notes = waitApi("/notes");
  await open("/wrapt/notizen");
  await notes;
  await page.waitForTimeout(1500);
  // Der zuletzt geöffnete Zettel kann variieren; gezielt die Checkliste zeigen.
  await page.getByRole("button", { name: "Notizen-Übersicht öffnen" }).click().catch(() => undefined);
  await page.waitForTimeout(600);
  await page.getByText("Onboarding-Checkliste", { exact: true }).first().click().catch(() => undefined);
  await page.waitForTimeout(900);
  await shoot(options.output ?? "wrapt-mobil-notizen", viewport.width, viewport.height);
}

// Wartet darauf, dass der eingebettete Proxy-Inhalt im ToolPanel gerendert ist.
async function waitForToolFrame(pathPart, timeout = 30_000) {
  await page.locator(".standalone-tool-content iframe, .panel iframe").first().waitFor({ state: "attached", timeout }).catch(() => undefined);
  await page.waitForResponse((response) => response.url().includes(pathPart), { timeout }).catch(() => undefined);
  await page.waitForTimeout(6_000);
}

async function captureT3Code(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  const projects = waitApi("/projects");
  await open("/wrapt/t3-code");
  await projects;
  await waitForToolFrame("/t3");
  await shoot(options.output ?? "wrapt-t3-code", viewport.width, viewport.height);
}

async function captureCodeServer(options = {}) {
  const viewport = options.viewport ?? desktopViewport;
  await page.setViewportSize(viewport);
  const projects = waitApi("/projects");
  await open("/wrapt/code-editor");
  await projects;
  await waitForToolFrame("/editor");
  await shoot(options.output ?? "wrapt-code-server", viewport.width, viewport.height);
}

// Landingpage-Motive: unveränderte Namen, Standard-Viewport 1440×900 und
// Standard-Zielverzeichnis, sofern die Umgebungsvariablen nicht gesetzt sind.
const landingTasks = [
  ["dashboard", () => captureDashboard()],
  ["terminal", () => captureTerminal()],
  ["previews", () => capturePreviews()],
  ["plugins", () => capturePlugins()],
  ["themes", () => captureThemes()],
  ["usage", () => captureUsage()],
  ["notes", () => captureNotes()],
  ["orbit", () => captureOrbit()],
  ["mobile", () => captureMobile()],
  ["mobil-notizen", () => captureMobileNotes()],
];

// Dokumentations- und README-Motive (docs-webseite/assets, einzige Quelle für
// Doku und README): gleiche Abläufe, andere Dateinamen und ein größerer
// Desktop-Viewport. Werden nur über die Gruppe "docs" oder per
// explizitem Namen gestartet, damit die Landing-Defaults unberührt bleiben.
const docsTasks = [
  ["docs-dashboard", () => captureDashboard({ output: "01-dashboard" })],
  ["docs-orbit", () => captureOrbit({ output: "02-workbench" })],
  ["docs-dateimanager", () => captureSimpleRoute("/wrapt/files", { output: "06-gallery" })],
  ["docs-terminal", () => captureTerminal({ output: "07-terminal" })],
  ["docs-usage", () => captureUsage({ output: "08-usage" })],
  ["docs-settings", () => captureSimpleRoute("/wrapt/settings", { output: "09-settings" })],
  ["docs-plugins", () => capturePlugins({ output: "12-plugins" })],
  ["docs-plugin-creator", () => captureSimpleRoute("/wrapt/plugins/maker", { output: "13-plugin-creator" })],
  ["docs-mobile", () => captureMobile({ output: "wrapt-mobil" })],
  ["docs-mobil-notizen", () => captureMobileNotes({ output: "wrapt-mobil-notizen" })],
  ["docs-t3-code", () => captureT3Code({ output: "04-t3-code" })],
  ["docs-code-server", () => captureCodeServer({ output: "05-code-server" })],
];

const groups = { landing: landingTasks, docs: docsTasks };
const allTasks = [...landingTasks, ...docsTasks];

// Optional nur einzelne Motive aufnehmen: node scripts/capture-landing-screenshots.mjs mobil-notizen
// Gruppen: "landing" (Standard) und "docs". Ohne Argumente laufen die Landing-Motive.
const requested = process.argv.slice(2).filter((value) => !value.startsWith("-"));
const selected = requested.length === 0
  ? landingTasks
  : [...new Set(requested.flatMap((name) => groups[name] ?? allTasks.filter(([key]) => key === name)))];
if (selected.length === 0) {
  console.error(`Unbekanntes Motiv. Gruppen: ${Object.keys(groups).join(", ")}. Motive: ${allTasks.map(([name]) => name).join(", ")}`);
  process.exit(1);
}

let failed = 0;
for (const [name, task] of selected) {
  console.log(`Aufnahme: ${name}`);
  try {
    await task();
  } catch (error) {
    failed += 1;
    console.error(`  Fehler bei ${name}: ${String(error?.message ?? error).slice(0, 300)}`);
  }
}

await browser.close();
console.log(`\n${results.length}/${selected.length} Aufnahmen erstellt.`);
if (failed > 0) process.exitCode = 1;
