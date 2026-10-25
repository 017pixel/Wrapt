#!/usr/bin/env node
// Optionaler offizieller Editor. Verändert weder code-server noch Wrapt-Dienste.
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareEditorExtension } from "./prepare-editor-extension.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(join(repositoryRoot, ".env")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const cliPath = resolve(process.env.VSCODE_WEB_CLI || join(homedir(), ".local/share/wrapt/vscode-web/code"));
const dataDirectory = resolve(process.env.VSCODE_WEB_DATA_DIR || join(homedir(), ".local/share/wrapt/vscode-web/data"));
const port = Number(process.env.CODE_SERVER_PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("CODE_SERVER_PORT ist ungültig.");
async function prepareExtension() {
  const configDirectory = resolve(repositoryRoot, process.env.CONFIG_DIR || "config");
  let configuration;
  for (const file of ["wrapt.local.json", "wrapt.example.json"]) {
    try { configuration = JSON.parse(await readFile(join(configDirectory, file), "utf8")); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const backendPort = Number(process.env.PORT || 3010);
  if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65_535) throw new Error("PORT ist ungültig.");
  await prepareEditorExtension({ dataDirectory,
    tokenFile: join(resolve(repositoryRoot, process.env.DATA_DIR || configuration?.paths?.dataDir || join(homedir(), ".local/share/wrapt")), "editor-open-capability"),
    port: backendPort,
  });
}
const args = [
  "--cli-data-dir", join(dataDirectory, "cli"),
  "serve-web",
  "--host", "127.0.0.1", "--port", String(port), "--server-base-path", "/editor",
  "--server-data-dir", join(dataDirectory, "server"), "--without-connection-token", "--disable-telemetry",
];

function run(binary, argumentsList) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, argumentsList, { stdio: "inherit", shell: false });
    const forwardInterrupt = () => child.kill("SIGINT");
    const forwardTermination = () => child.kill("SIGTERM");
    process.once("SIGINT", forwardInterrupt);
    process.once("SIGTERM", forwardTermination);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", forwardInterrupt);
      process.removeListener("SIGTERM", forwardTermination);
      if (code === 0) resolveRun();
      else reject(new Error(`${binary} wurde mit ${code ?? signal} beendet.`));
    });
  });
}

if (process.argv.includes("--prepare-extension")) {
  await prepareExtension();
  console.log("Wrapt-Editor-Erweiterung vorbereitet. Kein Dienst wurde neu gestartet.");
} else if (process.argv.includes("--print-command")) {
  console.log(JSON.stringify({ binary: cliPath, args, backend: "EDITOR_BACKEND=vscode" }, null, 2));
} else if (process.argv.includes("--prepare")) {
  const platform = { linux: "linux", darwin: "darwin" }[process.platform];
  if (!platform || !["x64", "arm64"].includes(process.arch)) throw new Error("Diese Plattform wird vom Launcher nicht unterstützt.");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "wrapt-vscode-cli-"));
  try {
    const response = await fetch(`https://update.code.visualstudio.com/latest/cli-${platform}-${process.arch}/stable`, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`VS-Code-Download: HTTP ${response.status}`);
    const archive = join(temporaryDirectory, "cli.tar.gz");
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
    await run("tar", ["-xzf", archive, "-C", temporaryDirectory]);
    await mkdir(dirname(cliPath), { recursive: true, mode: 0o700 });
    // rename kann über Dateisystemgrenzen scheitern; die Installation bleibt atomar.
    const { copyFile } = await import("node:fs/promises");
    await copyFile(join(temporaryDirectory, "code"), `${cliPath}.neu`);
    await chmod(`${cliPath}.neu`, 0o700);
    await rename(`${cliPath}.neu`, cliPath);
    console.log(`Offizielle VS-Code-CLI vorbereitet: ${cliPath}. Kein Dienst wurde verändert.`);
  } finally { await rm(temporaryDirectory, { recursive: true, force: true }); }
} else if (process.argv.includes("--start")) {
  if (!process.argv.includes("--accept-server-license-terms")) {
    throw new Error("Vor dem Start die VS-Code-Server-Lizenz prüfen: https://code.visualstudio.com/license/server. Zustimmung explizit über --accept-server-license-terms angeben.");
  }
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  await prepareExtension();
  await run(cliPath, [...args, "--accept-server-license-terms"]);
} else {
  console.log("vscode-editor.mjs --prepare | --prepare-extension | --print-command | --start --accept-server-license-terms");
}
