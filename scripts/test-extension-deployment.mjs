#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const port = Number(process.env.WRAPT_E2E_DEPLOY_PORT ?? 3450);
const origin = `http://127.0.0.1:${port}`;
const identity = "user@example.com";
const extensionId = "workbench.deploy.focus";
const root = await mkdtemp(join(tmpdir(), "wrapt-extension-deployment-"));
const webDist = await mkdtemp(join(tmpdir(), "wrapt-extension-deployment-web-"));
const launcher = join(repositoryRoot, "scripts/start-e2e-server.mjs");
let server;

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function waitForHealth() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/v1/health`);
      if (response.ok) return;
    } catch {
      // Der isolierte Server ist während des Starts noch nicht erreichbar.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Isolierter Deployment-Server wurde nicht bereit.");
}

async function startServer() {
  server = spawn(process.execPath, [launcher], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      WRAPT_E2E_EXTERNAL: "false",
      WRAPT_E2E_PORT: String(port),
      WRAPT_E2E_ROOT: root,
      WRAPT_E2E_KEEP_ROOT: "true",
      WRAPT_E2E_WEB_OUT_DIR: webDist,
      WRAPT_E2E_USER: identity,
      NODE_ENV: "test",
    },
  });
  await waitForHealth();
}

async function stopServer() {
  if (!server) return;
  const current = server;
  server = undefined;
  if (!current.killed) current.kill("SIGTERM");
  await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("Isolierter Deployment-Server beendet sich nicht.")), 20_000);
    current.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 && signal !== "SIGTERM") reject(new Error(`Deployment-Server beendet: ${code ?? signal}`));
      else resolvePromise();
    });
  });
}

async function api(path, init = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: { "tailscale-user-login": identity, ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function writePackage(version, name) {
  const directory = join(root, "data/extension-catalog/deploy-focus");
  const template = JSON.parse(await readFile(join(repositoryRoot, "extensions/plugins/focus-timer/plugin.json"), "utf8"));
  const content = { ...template, slug: "deploy-focus", name, version };
  const manifest = {
    manifestVersion: 1,
    id: extensionId,
    name,
    version,
    publisher: "wrapt",
    description: "Isolierter Deployment-Test für eine deklarative UI-Runtime.",
    license: "MIT",
    engines: { wrapt: ">=0.98.0", extensionApi: ">=1.0.0" },
    trust: "catalog-first-party",
    entrypoints: { ui: "./index.js" },
    permissions: [],
    activationEvents: [],
    contributes: {},
  };
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, "extension.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o600 }),
    writeFile(join(directory, "plugin.json"), `${JSON.stringify(content)}\n`, { mode: 0o600 }),
    writeFile(join(directory, "index.js"), "export default {};\n", { mode: 0o600 }),
  ]);
}

async function catalogEntry() {
  const catalog = await api("/api/v1/extensions/catalog");
  const entry = catalog.entries.find((candidate) => candidate.manifest.id === extensionId);
  assert(entry, "Deployment-Testpaket fehlt im Catalog.");
  return { catalog, entry };
}

async function dispatch(body) {
  return api(`/api/v1/extensions/${encodeURIComponent(extensionId)}/operations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

try {
  // Ein erster Start materialisiert die isolierte Konfiguration und den Catalog.
  await startServer();
  await stopServer();
  await writePackage("1.0.0", "Deployment Focus 1");

  await startServer();
  const first = await catalogEntry();
  const installed = await dispatch({
    operation: "install",
    extensionId,
    expectedRevision: (await api("/api/v1/extensions")).revision,
    source: {
      kind: "catalog",
      providerId: first.catalog.providerId,
      catalogRevision: first.catalog.revision,
      version: first.entry.manifest.version,
      packageIntegrity: first.entry.package.integrity,
    },
    enableAfterInstall: true,
  });
  assert(installed.extension.runtimeActive === true, "V1 wurde nicht aktiviert.");
  assert((await api("/api/v1/extensions/runtime")).runtimes[0]?.content.name === "Deployment Focus 1", "V1-Runtime fehlt.");
  await stopServer();

  // Der echte Startup-Reconciler stellt die entfernte Registry aus current.json wieder her.
  await unlink(join(root, "data/extensions.sqlite"));
  await writePackage("2.0.0", "Deployment Focus 2");
  await startServer();
  const restored = await api("/api/v1/extensions");
  const restoredEntry = restored.extensions.find((entry) => entry.id === extensionId);
  assert(restoredEntry?.activeVersion === "1.0.0", "Backup-Restore hat V1 nicht erhalten.");
  assert((await api("/api/v1/extensions/runtime")).runtimes[0]?.content.name === "Deployment Focus 1", "Restore hat den Runtime-Pointer nicht erhalten.");

  const second = await catalogEntry();
  assert(second.entry.manifest.version === "2.0.0", `Catalog läuft nach Neustart noch auf V1: ${JSON.stringify(second.entry)}`);
  assert(restoredEntry.availableVersion === "2.0.0", `Catalog-Update wurde nicht reconciliert: ${JSON.stringify(restoredEntry)}`);
  const updated = await dispatch({
    operation: "update",
    extensionId,
    expectedRevision: restored.revision,
    target: {
      providerId: second.catalog.providerId,
      catalogRevision: second.catalog.revision,
      version: second.entry.manifest.version,
      packageIntegrity: second.entry.package.integrity,
    },
  });
  assert(updated.extension.activeVersion === "2.0.0" && updated.extension.runtimeActive === true, "Update auf V2 war nicht aktiv.");
  assert((await api("/api/v1/extensions/runtime")).runtimes[0]?.content.name === "Deployment Focus 2", "V2-Runtime fehlt.");
  await stopServer();

  // Der aktive Pointer und das vollständige Release überleben einen weiteren Neustart.
  await startServer();
  const afterRestart = await api("/api/v1/extensions");
  const rolledBack = await dispatch({
    operation: "rollback",
    extensionId,
    expectedRevision: afterRestart.revision,
    targetVersion: "1.0.0",
    enableAfterRollback: true,
  });
  assert(rolledBack.extension.activeVersion === "1.0.0" && rolledBack.extension.runtimeActive === true, "Rollback auf V1 war nicht aktiv.");
  assert((await api("/api/v1/extensions/runtime")).runtimes[0]?.content.name === "Deployment Focus 1", "Rollback hat den vollständigen V1-Release nicht wiederhergestellt.");
  await stopServer();
  process.stdout.write("Extension-Deployment OK (isolierter Neustart, Backup-Restore, Update und vollständiger Rollback).\n");
} finally {
  await stopServer().catch(() => undefined);
  await Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(webDist, { recursive: true, force: true }),
  ]);
}
