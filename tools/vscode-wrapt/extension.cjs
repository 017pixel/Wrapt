/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports -- VS-Code-Workspace-Erweiterungen laden CommonJS. */
const vscode = require("vscode");
const http = require("node:http");
const { readFileSync } = require("node:fs");
const { join, relative, isAbsolute } = require("node:path");
const { setTimeout, clearTimeout } = require("node:timers");
const { URL } = require("node:url");

/** Nur öffentliche VS-Code-APIs; keine DOM- oder Produkt-Patches. */
function activate(context) {
  const output = vscode.window.createOutputChannel("Wrapt Editor");
  let disposed = false;
  let request;
  let timer;
  let retry = 0;
  let lastRequest;
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  context.subscriptions.push(output,
    vscode.commands.registerCommand("wrapt.applyTheme", async () => {
      await vscode.workspace.getConfiguration("workbench").update("colorTheme", "Wrapt Dark", vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand("wrapt.runningExtensions", () => vscode.commands.executeCommand("workbench.action.showRuntimeExtensions")),
    vscode.commands.registerCommand("wrapt.applyPerformance", async () => {
      const files = vscode.workspace.getConfiguration("files");
      const existing = files.inspect("watcherExclude")?.globalValue ?? {};
      const generated = Object.fromEntries(["**/dist/**", "**/coverage/**", "**/.next/**", "**/.turbo/**"].map((pattern) => [pattern, true]));
      await files.update("watcherExclude", { ...generated, ...existing }, vscode.ConfigurationTarget.Global);
      await vscode.window.showInformationMessage("Wrapt-Leistungsprofil angewendet. Quelldateien und deine bisherigen Ausnahmen bleiben erhalten.");
    }),
    { dispose() { disposed = true; clearTimeout(timer); request?.destroy(); } },
  );
  if (!folder) return;

  async function receive(event) {
    if (event.type !== "editor.open" || !event.file || !event.requestId || event.requestId === lastRequest) return;
    const child = relative(folder, event.file);
    if (child === ".." || child.startsWith("../") || isAbsolute(child)) return;
    lastRequest = event.requestId;
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(event.file));
      const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
      if (event.line) {
        const line = Math.min(Math.max(event.line - 1, 0), document.lineCount - 1);
        const column = Math.min(Math.max((event.column ?? 1) - 1, 0), document.lineAt(line).text.length);
        const position = new vscode.Position(line, column);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      }
    } catch {
      output.appendLine("Die angefragte Datei konnte nicht geöffnet werden.");
      await vscode.window.showWarningMessage("Wrapt konnte die angefragte Datei nicht öffnen. Sie wurde möglicherweise verschoben oder gelöscht.");
    }
  }

  function connect() {
    if (disposed) return;
    const reconnect = () => {
      if (!disposed) timer = setTimeout(connect, Math.min(15_000, 500 * 2 ** Math.min(retry++, 5)));
    };
    try {
      const configuration = JSON.parse(readFileSync(join(context.extensionPath, "connection.json"), "utf8"));
      const url = new URL(configuration.url);
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") return;
      url.pathname = "/api/v1/editor/runtime";
      url.searchParams.set("folder", folder);
      const token = readFileSync(configuration.tokenFile, "utf8").trim();
      request = http.get(url, { headers: { authorization: `Bearer ${token}` } }, (response) => {
        if (response.statusCode !== 200) { response.resume(); return; }
        retry = 0;
        response.setEncoding("utf8");
        let pending = "";
        let chain = Promise.resolve();
        response.on("data", (chunk) => {
          pending += chunk;
          if (pending.length > 65_536) { request.destroy(); return; }
          let index;
          while ((index = pending.indexOf("\n")) >= 0) {
            const line = pending.slice(0, index); pending = pending.slice(index + 1);
            try { const event = JSON.parse(line); chain = chain.then(() => receive(event)).catch(() => {}); } catch { /* Ungültige Frames ignorieren. */ }
          }
        });
      });
      request.setTimeout(35_000, () => request.destroy());
      request.on("error", () => {});
      request.once("close", reconnect);
    } catch { reconnect(); }
  }
  connect();
}

module.exports = { activate };
