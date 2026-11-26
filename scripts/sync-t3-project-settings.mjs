#!/usr/bin/env node
// Hält T3 Codes Projektbasis am Projektroot der Workbench.
//
// T3 legt neue Projekte, neue Ordner und Klone standardmäßig unter ~/ ab.
// Wrapt entdeckt und previewt aber nur Projekte unter paths.projectsRoot.
// Ohne Abgleich entstehen zwei Klone: einer für den Agenten, einer für die
// Preview. Dieses Skript schreibt ausschließlich addProjectBaseDirectory und
// lässt alle anderen T3-Einstellungen unangetastet. T3 beobachtet die Datei
// und übernimmt den Wert ohne Neustart.
//
// Aufruf: node scripts/sync-t3-project-settings.mjs [--check]
// Exit 1 bei --check, wenn die Einstellung nicht zum Projektroot passt.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

function loadConfig() {
  for (const name of ["wrapt.local.json", "wrapt.example.json", "workbench.local.json"]) {
    try {
      return JSON.parse(readFileSync(join(repoRoot, "config", name), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error("config/wrapt.local.json oder wrapt.example.json fehlt.");
}

function log(message) {
  console.log(`[t3-projekte] ${message}`);
}

const config = loadConfig();
const home = config.system?.homeDirectory ?? process.env.HOME ?? homedir();
const projectsRoot = resolve(config.paths?.projectsRoot ?? join(home, "projects"));
const t3Home = resolve(process.env.T3CODE_HOME ?? join(home, ".t3"));
const settingsPath = join(t3Home, "userdata", "settings.json");
const settingsDirectory = dirname(settingsPath);

let settings = {};
if (existsSync(settingsPath)) {
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch (error) {
    console.error(`[t3-projekte] ${settingsPath} ist kein gültiges JSON: ${error.message}`);
    process.exit(1);
  }
}

const current = typeof settings.addProjectBaseDirectory === "string" ? settings.addProjectBaseDirectory : "";
const expected = projectsRoot;

if (current === expected) {
  log(`Projektbasis ist bereits ${expected}.`);
  process.exit(0);
}

if (checkOnly) {
  console.error(`[t3-projekte] Projektbasis ist '${current || "(leer)"}', erwartet '${expected}'.`);
  process.exit(1);
}

// Auch vor der ersten T3-Installation anlegen: T3 liest die Datei beim Start
// und übernimmt die Projektbasis dann sofort.
mkdirSync(settingsDirectory, { recursive: true, mode: 0o700 });
settings.addProjectBaseDirectory = expected;
const temporaryPath = `${settingsPath}.tmp-${process.pid}`;
writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
renameSync(temporaryPath, settingsPath);
log(`Projektbasis von '${current || "(leer)"}' auf ${expected} gesetzt.`);
