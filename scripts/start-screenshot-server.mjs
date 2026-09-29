#!/usr/bin/env node
// Startet eine vollständig isolierte Wrapt-Instanz für Landingpage-Screenshots:
// eigener Portbereich (Default 3410), eigene Config, eigene SQLite-Datenbank und
// eigene Temp-Pfade. Die laufende Workbench bleibt unberührt.
import { execFileSync, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFixtureData } from "./lib/screenshot-fixtures.mjs";
import { SCREENSHOT_IDENTITY, seedScreenshotData } from "./lib/screenshot-seed.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const basePort = Number(process.env.WRAPT_SCREENSHOT_PORT ?? 3410);
if (!Number.isInteger(basePort) || basePort < 1 || basePort + 130 > 65_535) {
  throw new Error("WRAPT_SCREENSHOT_PORT muss eine gültige TCP-Portnummer sein.");
}
const root = resolve(process.env.WRAPT_SCREENSHOT_ROOT?.trim() || join(tmpdir(), "wrapt-screenshots"));
if (!root.startsWith(`${resolve(tmpdir())}/`) && !root.startsWith("/private/var/folders/")) {
  throw new Error(`WRAPT_SCREENSHOT_ROOT muss unter ${tmpdir()} liegen (erhalten: ${root}).`);
}
const webDistDirectory = resolve(process.env.WRAPT_SCREENSHOT_WEB_DIST?.trim() || join(tmpdir(), "wrapt-screenshots-web"));
const configDirectory = join(root, "config");
const dataDirectory = join(root, "data");
const projectsRoot = join(root, "projects");
const logPath = join(root, "server.log");
const pidPath = join(root, "server.pid");
const codexbarPidPath = join(root, "codexbar.pid");
const codexbarPort = basePort + 120;

async function portIsFree(port) {
  return new Promise((resolveFree) => {
    const probe = createServer();
    probe.once("error", () => resolveFree(false));
    probe.once("listening", () => probe.close(() => resolveFree(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function assertPortsFree() {
  for (let offset = 0; offset <= 130; offset += 1) {
    const port = basePort + offset;
    if (!(await portIsFree(port))) {
      throw new Error(`Port ${port} ist belegt. Screenshot-Instanz nutzt ${basePort}..${basePort + 130}. Bitte WRAPT_SCREENSHOT_PORT ändern.`);
    }
  }
}

function stopProcess(pid) {
  try { process.kill(pid, "SIGTERM"); return true; } catch { return false; }
}

async function readPid(path) {
  try { return Number((await readFile(path, "utf8")).trim()); } catch { return null; }
}

/** Beendet nur den eigenen Preview-tmux-Server (Socket `wrapt-screenshots`). */
function stopPreviewSupervisor() {
  try {
    execFileSync("tmux", ["-L", "wrapt-screenshots", "kill-server"], { stdio: "ignore", env: { ...process.env, TMUX_TMPDIR: "/tmp" } });
  } catch {
    // Kein eigener Supervisor aktiv.
  }
}

async function stopAll() {
  for (const path of [pidPath, codexbarPidPath]) {
    const pid = await readPid(path);
    if (pid && Number.isInteger(pid)) stopProcess(pid);
  }
  stopPreviewSupervisor();
  console.log("Screenshot-Instanz gestoppt (Root bleibt erhalten).");
}

if (process.argv.includes("--stop")) {
  await stopAll();
  process.exit(0);
}

const previousServerPid = await readPid(pidPath);
const previousCodexbarPid = await readPid(codexbarPidPath);
for (const pid of [previousCodexbarPid, previousServerPid]) {
  if (pid && Number.isInteger(pid)) stopProcess(pid);
}
if (previousServerPid || previousCodexbarPid) await new Promise((done) => setTimeout(done, 800));
// Eigene Preview-Sessions eines früheren Laufs freigeben (dedizierter Socket).
stopPreviewSupervisor();
if (process.argv.includes("--reset")) {
  await rm(root, { recursive: true, force: true });
}
await Promise.all([
  mkdir(configDirectory, { recursive: true }),
  mkdir(dataDirectory, { recursive: true }),
  mkdir(join(dataDirectory, "tmux"), { recursive: true }),
  mkdir(projectsRoot, { recursive: true }),
]);
await assertPortsFree();

if (!(await access(join(webDistDirectory, "index.html")).then(() => true).catch(() => false))) {
  throw new Error(`Web-Build fehlt unter ${webDistDirectory}. Zuerst bauen: WRAPT_E2E_WEB_OUT_DIR="${webDistDirectory}" pnpm build`);
}

const config = JSON.parse(await readFile(join(repositoryRoot, "config/wrapt.example.json"), "utf8"));
config.system = { user: "demo", homeDirectory: root, instanceName: "demo-server" };
config.tailscale.allowedUsers = ["demo@example.com", SCREENSHOT_IDENTITY];
config.tailscale.adminUsers = ["demo@example.com", SCREENSHOT_IDENTITY];
config.t3.port = basePort + 1;
config.opencodeWeb = { ...config.opencodeWeb, port: basePort + 2, host: "127.0.0.1" };
config.hermes = { ...config.hermes, port: basePort + 3 };
config.previews = {
  ...config.previews,
  allowedProjectPorts: Array.from({ length: 10 }, (_, index) => basePort + 30 + index),
  slotPorts: Array.from({ length: 12 }, (_, index) => basePort + 10 + index),
  publicPorts: Array.from({ length: 12 }, (_, index) => basePort + 100 + index),
  gatewayV2Enabled: true,
  bridgeEnabled: true,
  diagnosticsEnabled: true,
  storageSyncMode: "opt-in",
  slotResetEnabled: true,
};
config.paths = {
  projectsRoot,
  orbitProjectBrowserRoot: projectsRoot,
  terminalAllowedRoots: [root],
  terminalDefaultCwd: join(projectsRoot, "nordlicht"),
  dataDir: dataDirectory,
  orbitBackupDir: join(dataDirectory, "orbit-backups"),
  orbitAssetDir: join(dataDirectory, "orbit-assets"),
  fileGalleryDir: join(dataDirectory, "file-gallery"),
  wraptProfilesRoot: join(dataDirectory, "profiles"),
  codexSharedHome: join(dataDirectory, "shared-codex"),
  claudeSharedHome: join(dataDirectory, "shared-claude"),
  opencodeSharedHome: join(dataDirectory, "shared-opencode"),
  databasePath: join(dataDirectory, "wrapt.sqlite"),
};
config.codexbar.configPath = join(dataDirectory, "codexbar.json");
config.codexbar.oauthProfileHomes = [];
config.plugins = { wraptPluginsSkillPath: join(dataDirectory, "wrapt-plugins-SKILL.md") };
await writeFile(join(configDirectory, "wrapt.local.json"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// Nur Dienste, die tatsächlich in der isolierten Instanz prüfbar sind — der
// Beispielkatalog würde sonst echte Host-Dienste auf 3773/8080 abfragen.
// T3 Code und code-server laufen für die Dokumentationsmotive nur, wenn der
// Aufrufer sie isoliert gestartet hat (WRAPT_SCREENSHOT_TOOLS=1); die
// öffentlichen URLs sind reine Dummy-Adressen und werden nie veröffentlicht.
const serviceCatalog = [
  { id: "wrapt-backend", name: "Wrapt Backend", mode: "external", publicUrl: null, check: { type: "self" } },
  { id: "demo-dienst", name: "Demo-Dienst", mode: "external", publicUrl: null, check: { type: "http", url: `http://127.0.0.1:${codexbarPort}/health` } },
];
if (process.env.WRAPT_SCREENSHOT_TOOLS === "1") {
  serviceCatalog.unshift(
    { id: "t3-code", name: "T3 Code", mode: "hybrid", publicUrl: "https://demo.example/t3/", check: { type: "http", url: `http://127.0.0.1:${basePort + 1}/` } },
    { id: "code-server", name: "code-server", mode: "hybrid", publicUrl: "https://demo.example:8443/editor/", check: { type: "http", url: "http://127.0.0.1:8080/" } },
  );
}
const services = { services: serviceCatalog };
await writeFile(join(configDirectory, "services.local.json"), `${JSON.stringify(services, null, 2)}\n`, { mode: 0o600 });
await writeFile(join(configDirectory, "commands.local.json"), await readFile(join(repositoryRoot, "config/commands.example.json")), { mode: 0o600 });
await writeFile(join(dataDirectory, "wrapt-plugins-SKILL.md"), "# Wrapt-Plugins\n\nIsolierte Anleitung für die Screenshot-Instanz.\n", { mode: 0o600 });

const { profilePaths } = await writeFixtureData({ root, repositoryRoot, basePort });

const tmuxExecutable = await access("/opt/homebrew/bin/tmux").then(() => "/opt/homebrew/bin/tmux").catch(() => "/usr/bin/tmux");
const sharedEnvironment = {
  ...process.env,
  CONFIG_DIR: configDirectory,
  DATABASE_PATH: join(dataDirectory, "wrapt.sqlite"),
  NODE_ENV: "test",
  WRAPT_E2E: "true",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  // Schnellerer Messverlauf nur für die Fixture: Der Server sampelt und cached
  // sonst alle 5 s, wodurch das Dashboard-Diagramm nach einem Neustart fast leer
  // bleibt. So füllt der Warmlauf vor der Aufnahme ~25 Punkte in ~25 s.
  METRICS_CACHE_MS: process.env.METRICS_CACHE_MS ?? "1000",
  PROJECT_DISCOVERY_ENABLED: "false",
  TERMINAL_SUPERVISOR: "direct",
  PREVIEW_TMUX_SOCKET: "wrapt-screenshots",
  // Kurzer Socket-Pfad: der Fixture-Root ist für sockaddr_un unter macOS zu lang.
  TMUX_TMPDIR: "/tmp",
  TMUX_PATH: tmuxExecutable,
  // Eigene Shell-Isolation: verhindert, dass Terminal-Sessions die echten
  // Dotfiles und den echten Benutzernamen des Hosts verwenden.
  HOME: root,
  USER: "demo",
  LOGNAME: "demo",
  ORBIT_BACKUP_DIR: join(dataDirectory, "orbit-backups"),
  ORBIT_ASSET_DIR: join(dataDirectory, "orbit-assets"),
  FILE_GALLERY_DIR: join(dataDirectory, "file-gallery"),
  CODEXBAR_CONFIG_PATH: join(dataDirectory, "codexbar.json"),
  CODEXBAR_BASE_URL: `http://127.0.0.1:${codexbarPort}`,
  CODEXBAR_CLI_PATH: "/bin/false",
  CODEX_SHARED_HOME: join(dataDirectory, "shared-codex"),
  CLAUDE_SHARED_HOME: join(dataDirectory, "shared-claude"),
  OPENCODE_SHARED_HOME: join(dataDirectory, "shared-opencode"),
  WRAPT_PROFILES_ROOT: join(dataDirectory, "profiles"),
  HERMES_HOME: join(dataDirectory, "hermes"),
  HERMES_ENABLED: "false",
  CLAUDE_CLI_PATH: "/bin/false",
  CODEX_CLI_PATH: "/bin/false",
  OPENCODE_CLI_PATH: "/bin/false",
  T3_CLI_PATH: "/bin/false",
  HERMES_CLI_PATH: "/bin/false",
  CODEX_OAUTH_PROFILE_HOMES: "",
  CODEX_OAUTH_PRIMARY_FALLBACK: "false",
  TERMINAL_ALLOWED_ROOTS: root,
  TERMINAL_DEFAULT_CWD: join(projectsRoot, "nordlicht"),
  TERMINAL_ALLOWED_USERS: `${SCREENSHOT_IDENTITY},demo@example.com`,
  ADMIN_USERS: SCREENSHOT_IDENTITY,
  WRAPT_LOCAL_USERNAME: SCREENSHOT_IDENTITY,
  WRAPT_LOCAL_LOOPBACK_TRUST: "true",
  WRAPT_DEV_TAILSCALE_USER: SCREENSHOT_IDENTITY,
  PREVIEW_PUBLIC_ORIGIN_MODE: "loopback-http",
  ORBIT_DESTRUCTIVE_DROP_PERCENT: "100",
  WRAPT_E2E_ALLOW_DESTRUCTIVE_ORBIT_RESET: "true",
  PORT: String(basePort),
  WEB_DIST_DIR: webDistDirectory,
};

function spawnDetached(command, args, logFile) {
  const fileDescriptor = openSync(logFile, "a");
  const child = spawn(command, args, { cwd: repositoryRoot, env: sharedEnvironment, detached: true, stdio: ["ignore", fileDescriptor, fileDescriptor] });
  child.unref();
  closeSync(fileDescriptor);
  return child.pid;
}

const codexbarPid = spawnDetached(process.execPath, [join(repositoryRoot, "scripts/lib/screenshot-codexbar-fixture.mjs"), String(codexbarPort)], join(root, "codexbar.log"));
await writeFile(codexbarPidPath, String(codexbarPid));
const serverPid = spawnDetached(process.execPath, ["apps/server/dist/index.js"], logPath);
await writeFile(pidPath, String(serverPid));

// Wird der Seed-Lauf abgebrochen, bleibt keine halb gestartete Instanz zurück.
const cleanupOnSignal = () => {
  stopProcess(serverPid);
  stopProcess(codexbarPid);
  stopPreviewSupervisor();
  process.exit(1);
};
process.once("SIGINT", cleanupOnSignal);
process.once("SIGTERM", cleanupOnSignal);

async function waitForHealth(timeoutMilliseconds = 120_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${basePort}/api/v1/health`);
      if (response.ok) return;
    } catch {
      // Server startet noch.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`Server wurde nicht rechtzeitig bereit. Log: ${logPath}`);
}

const baseUrl = `http://127.0.0.1:${basePort}`;
try {
  await waitForHealth();
  const seed = await seedScreenshotData({ baseUrl, root, profilePaths });
  console.log(seed.skipped ? "Seed übersprungen (bereits vorhanden)." : "Dummy-Daten angelegt.");
} catch (error) {
  console.error(String(error?.message ?? error));
  console.error(`Server läuft mit PID ${serverPid}. Log: ${logPath}`);
  process.exit(1);
}

console.log("Screenshot-Instanz bereit.");
console.log(`URL:   ${baseUrl}/wrapt/`);
console.log(`PID:   ${serverPid}`);
console.log(`Log:   ${logPath}`);
console.log(`Root:  ${root}`);
console.log(`Stopp: node scripts/start-screenshot-server.mjs --stop`);
console.log(`Neustart: node scripts/start-screenshot-server.mjs --reset`);
