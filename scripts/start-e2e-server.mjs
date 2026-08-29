#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.WRAPT_E2E_EXTERNAL === "true") {
  throw new Error("Der isolierte E2E-Server darf nicht für einen externen Server gestartet werden.");
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePorts = JSON.parse(
  await readFile(join(repositoryRoot, "tests/fixtures/preview-apps/ports.json"), "utf8"),
);
const e2ePort = Number(process.env.WRAPT_E2E_PORT ?? 3010);
if (!Number.isInteger(e2ePort) || e2ePort < 1 || e2ePort + 130 > 65_535) {
  throw new Error("WRAPT_E2E_PORT muss eine gültige TCP-Portnummer sein.");
}
const requestedRoot = process.env.WRAPT_E2E_ROOT?.trim();
if (requestedRoot !== undefined && process.env.WRAPT_E2E_KEEP_ROOT !== "true") {
  throw new Error("WRAPT_E2E_ROOT benötigt WRAPT_E2E_KEEP_ROOT=true.");
}
const temporaryRoot = requestedRoot ? resolve(requestedRoot) : await mkdtemp(join(tmpdir(), "wrapt-e2e-"));
const ownsTemporaryRoot = requestedRoot === undefined;
const configDirectory = join(temporaryRoot, "config");
const dataDirectory = join(temporaryRoot, "data");
const tmuxDirectory = join(dataDirectory, "tmux");
const webDistDirectory = process.env.WRAPT_E2E_WEB_OUT_DIR
  ? resolve(process.env.WRAPT_E2E_WEB_OUT_DIR)
  : await mkdtemp(join(tmpdir(), "wrapt-e2e-web-"));
const ownsWebDistDirectory = process.env.WRAPT_E2E_WEB_OUT_DIR === undefined;
const e2eIdentity = process.env.WRAPT_E2E_USER?.trim() || "user@example.com";
await Promise.all([mkdir(configDirectory, { recursive: true }), mkdir(dataDirectory, { recursive: true }), mkdir(tmuxDirectory, { recursive: true })]);

function assertInside(root, value, label) {
  const resolved = resolve(value);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error(`E2E-Isolation: ${label} zeigt außerhalb des temporären Roots.`);
  }
}

function assertTemporary(value, label) {
  if (!resolve(value).startsWith(`${resolve(tmpdir())}/`)) {
    throw new Error(`E2E-Isolation: ${label} ist kein temporärer Pfad.`);
  }
}

assertTemporary(webDistDirectory, "WEB_DIST_DIR");
if (requestedRoot) assertTemporary(temporaryRoot, "E2E_ROOT");
const creatorSkillPath = join(dataDirectory, "plugin-creator-SKILL.md");
await writeFile(creatorSkillPath, "# Plugin Creator\n\nIsolierte Anleitung für den Plugin-Creator-Test.\n", { mode: 0o600 });

const config = JSON.parse(await readFile(join(repositoryRoot, "config/wrapt.example.json"), "utf8"));
config.system = { user: "e2e", homeDirectory: temporaryRoot };
const e2eT3Channel = process.env.WRAPT_E2E_T3_CHANNEL?.trim();
if (e2eT3Channel !== undefined && e2eT3Channel !== "stable" && e2eT3Channel !== "nightly") {
  throw new Error("WRAPT_E2E_T3_CHANNEL muss stable oder nightly sein.");
}
if (e2eT3Channel) config.t3.channel = e2eT3Channel;
// Der isolierte E2E-Server bindet nur an Loopback (HOST-Default 127.0.0.1) und
// läuft mit eigener Temp-Konfiguration. Die Terminal-Route verlangt eine
// explizit erlaubte Identität; sie wird für den Lauf aus WRAPT_E2E_USER
// übernommen und bleibt auf den isolierten Server begrenzt.
// Die weiteren Test-Identitäten decken die Specs ab, die mit eigener Identität
// laufen (Dateimanager, Projektbrowser, UI-Check).
const e2eAllowedUsers = [
  "user@example.com",
  e2eIdentity,
  "file-manager@example.com",
  "project-browser@example.com",
  "ui-check@example.com",
  ...["chromium", "firefox", "webkit"].flatMap((browser) =>
    ["mobile", "resize", "ui", "release"].flatMap((suite) =>
      [0, 1].map((retry) => `orbit-${suite}-${browser}-${retry}@example.com`))),
  ...["chromium", "firefox", "webkit"].flatMap((browser) => [0, 1].flatMap((retry) => [
    `plugins-authoring-${browser}-${retry}@example.com`,
    `plugins-authoring-code-${browser}-${retry}@example.com`,
    `plugins-mein-plugin-${browser}-${retry}@example.com`,
  ])),
].filter((identity, index, all) => all.indexOf(identity) === index);
config.tailscale.allowedUsers = e2eAllowedUsers;
config.tailscale.adminUsers = e2eAllowedUsers;
// Alle vom isolierten Server reservierten Listener werden aus dem E2E-Port
// abgeleitet. Dadurch kollidiert ein lokaler Lauf nicht mit der laufenden
// Workbench oder einem anderen Testprozess.
config.t3.port = e2ePort + 1;
config.opencodeWeb = { ...config.opencodeWeb, port: e2ePort + 2, host: "127.0.0.1" };
// Der Portscan des Testservers darf keine realen Workbench-/Host-Ports sichtbar
// machen. Projektlaufzeiten im E2E-Modus bekommen deshalb einen eigenen Bereich.
config.previews.allowedProjectPorts = Array.from({ length: 10 }, (_, index) => e2ePort + 30 + index);
config.previews.slotPorts = Array.from({ length: 12 }, (_, index) => e2ePort + 10 + index);
config.previews.publicPorts = Array.from({ length: 12 }, (_, index) => e2ePort + 100 + index);
config.paths = {
  projectsRoot: repositoryRoot,
  orbitProjectBrowserRoot: repositoryRoot,
  terminalAllowedRoots: [repositoryRoot, temporaryRoot],
  terminalDefaultCwd: repositoryRoot,
  dataDir: dataDirectory,
  browserProfilesRoot: join(dataDirectory, "browser-profiles"),
  orbitBackupDir: join(dataDirectory, "orbit-backups"),
  orbitAssetDir: join(dataDirectory, "orbit-assets"),
  fileGalleryDir: join(dataDirectory, "file-gallery"),
  wraptProfilesRoot: join(dataDirectory, "profiles"),
  codexSharedHome: join(dataDirectory, "shared-codex"),
  claudeSharedHome: join(dataDirectory, "shared-claude"),
  opencodeSharedHome: join(dataDirectory, "shared-opencode"),
  databasePath: join(dataDirectory, "wrapt.sqlite"),
};
assertInside(temporaryRoot, config.system.homeDirectory, "system.homeDirectory");
for (const name of [
  "dataDir", "browserProfilesRoot", "orbitBackupDir", "orbitAssetDir", "fileGalleryDir",
  "wraptProfilesRoot", "codexSharedHome", "claudeSharedHome", "opencodeSharedHome", "databasePath",
]) assertInside(temporaryRoot, config.paths[name], `paths.${name}`);
config.codexbar.configPath = join(dataDirectory, "codexbar.json");
config.codexbar.oauthProfileHomes = [];
config.plugins = { creatorSkillPath };
config.previews = {
  ...config.previews,
  gatewayV2Enabled: true,
  bridgeEnabled: true,
  diagnosticsEnabled: true,
  storageSyncMode: "opt-in",
  slotResetEnabled: true,
};
await writeFile(
  join(configDirectory, "wrapt.local.json"),
  `${JSON.stringify(config, null, 2)}\n`,
  { mode: 0o600 },
);

const projects = {  projects: [
    {
      id: "wrapt",
      name: "Wrapt",
      description: "Isoliertes E2E-Projekt",
      path: repositoryRoot,
      enabled: true,
      sortOrder: 1,
      previews: [
        {
          id: "e2e-spa",
          name: "E2E SPA",
          url: null,
          targetPort: fixturePorts.spa,
          path: "/",
          mode: "hybrid",
          runtime: "iframe",
          dependencies: [],
        },
      ],
    },
    {
      id: "chappie",
      name: "Chappie",
      description: "Isolierte E2E-Fixture",
      path: join(repositoryRoot, "tests/fixtures"),
      enabled: true,
      sortOrder: 2,
      previews: [],
    },
  ],
};
await writeFile(join(configDirectory, "projects.local.json"), `${JSON.stringify(projects, null, 2)}\n`, { mode: 0o600 });
// Der Extension-Catalog des isolierten Servers wird aus der Fixture bestückt,
// damit die Extensions-Verwaltung echte Einträge findet.
const extensionCatalogDirectory = join(dataDirectory, "extension-catalog");
try {
  await access(join(extensionCatalogDirectory, "demo-clock", "extension.json"));
} catch {
  await cp(join(repositoryRoot, "tests/fixtures/extension-catalog"), extensionCatalogDirectory, { recursive: true });
}
const services = JSON.parse(await readFile(join(repositoryRoot, "config/services.example.json"), "utf8"));
// Die Hosted-App-Prüfung soll nicht die produktionelle Tailnet-URL aus der
// Beispielkonfiguration übernehmen. Ein eigener URL-Wert bleibt für lokale
// Tests überschreibbar.
const e2eT3ClientUrl = process.env.WRAPT_E2E_T3_CLIENT_URL?.trim() || "https://app.t3.codes";
if (e2eT3ClientUrl) {
  const t3Service = services.services.find((service) => service.id === "t3-code");
  if (!t3Service) throw new Error("Der E2E-Service T3 Code fehlt.");
  t3Service.publicUrl = e2eT3ClientUrl;
}
await writeFile(join(configDirectory, "services.local.json"), `${JSON.stringify(services, null, 2)}\n`, { mode: 0o600 });
const commands = await readFile(join(repositoryRoot, "config/commands.example.json"));
await writeFile(join(configDirectory, "commands.local.json"), commands, { mode: 0o600 });

const child = spawn(process.execPath, ["apps/server/dist/index.js"], {
  cwd: repositoryRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    CONFIG_DIR: configDirectory,
    DATABASE_PATH: join(dataDirectory, "wrapt.sqlite"),
    NODE_ENV: "test",
    WRAPT_E2E: "true",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
    PROJECT_DISCOVERY_ENABLED: "false",
    TERMINAL_SUPERVISOR: "direct",
    PREVIEW_TMUX_SOCKET: `wrapt-e2e-${process.pid}`,
    TMUX_TMPDIR: tmuxDirectory,
    // Die .env des Repos enthält produktive Pfade (Orbit-Backups, Terminal-Roots,
    // Codexbar, KI-Profile). Der isolierte Testserver darf diese NICHT erben:
    // Beim Start würde er die echten Orbit-Daten aus den Backups wiederherstellen
    // und beim Speichern die echten Backups mit Testdaten überschreiben. Alle
    // Pfad- und Profilvariablen werden deshalb auf die Temp-Umgebung umgebogen.
    ORBIT_BACKUP_DIR: join(dataDirectory, "orbit-backups"),
    ORBIT_ASSET_DIR: join(dataDirectory, "orbit-assets"),
    FILE_GALLERY_DIR: join(dataDirectory, "file-gallery"),
    CODEXBAR_CONFIG_PATH: join(dataDirectory, "codexbar.json"),
    CODEXBAR_BASE_URL: `http://127.0.0.1:${e2ePort + 120}`,
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
    // Der isolierte Server nutzt das lokale Snap-Chromium ohne Host-Sandbox.
    BROWSER_ALLOW_NO_SANDBOX: "true",
    TERMINAL_ALLOWED_ROOTS: `${repositoryRoot},${temporaryRoot}`,
    TERMINAL_DEFAULT_CWD: temporaryRoot,
    // Die .env des Repos setzt TERMINAL_ALLOWED_USERS für die Produktion; der
    // isolierte Testserver nutzt stattdessen seine Testidentitäten.
    // api.spec und die Shell-Tests melden sich als user@example.com an, die
    // Preview-Szenarien als e2eIdentity.
    TERMINAL_ALLOWED_USERS: e2eAllowedUsers.join(","),
    // Die .env erbt ORBIT_DESTRUCTIVE_DROP_PERCENT=50 als Produktionsschutz;
    // die Tests ersetzen Orbit-Dokumente jedoch komplett (eigene Arbeitsflächen).
    ORBIT_DESTRUCTIVE_DROP_PERCENT: "100",
    WRAPT_E2E_ALLOW_DESTRUCTIVE_ORBIT_RESET: "true",
    WRAPT_DEV_TAILSCALE_USER: e2eIdentity,
    PREVIEW_PUBLIC_ORIGIN_MODE: "loopback-http",
    MISTRAL_API_KEY: "",
    PORT: String(e2ePort),
    ...(webDistDirectory ? { WEB_DIST_DIR: webDistDirectory } : {}),
  },
});

let stopping = false;
const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
};
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

let exitCode;
try {
  exitCode = await new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
} finally {
  if (ownsTemporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  if (ownsWebDistDirectory) await rm(webDistDirectory, { recursive: true, force: true });
}
process.exitCode = exitCode;
