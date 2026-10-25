/* global require, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports -- Node-Test der CommonJS-Erweiterung. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { EventEmitter } = require("node:events");
const { runInNewContext } = require("node:vm");
const { setImmediate } = require("node:timers/promises");

async function fixture() {
  const commands = new Map(), updates = [], shown = [];
  const response = new EventEmitter();
  response.statusCode = 200; response.setEncoding = () => {};
  const request = new EventEmitter();
  request.setTimeout = () => {}; request.destroy = () => {};
  const document = { lineCount: 2, isDirty: true, lineAt: () => ({ text: "ungespeichert" }) };
  const vscode = {
    ConfigurationTarget: { Global: 1 },
    Uri: { file: (path) => path },
    Position: class { constructor(line, character) { this.line = line; this.character = character; } },
    Range: class {}, Selection: class {},
    commands: { registerCommand: (id, handler) => { commands.set(id, handler); return { dispose() {} }; } },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: "/projekt" } }],
      openTextDocument: async (path) => { shown.push(path); return document; },
      getConfiguration: (section) => ({
        inspect: () => ({ globalValue: { "**/dist/**": false } }),
        update: async (key, value) => updates.push({ section, key, value }),
      }),
    },
    window: {
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      showTextDocument: async () => ({ revealRange() {} }),
      showInformationMessage: async () => {}, showWarningMessage: async () => {},
    },
  };
  const module = { exports: {} };
  runInNewContext(readFileSync(join(__dirname, "extension.cjs"), "utf8"), {
    module,
    require: (id) => id === "vscode" ? vscode : id === "node:http" ? { get: (_url, _options, callback) => { callback(response); return request; } }
      : id === "node:fs" ? { readFileSync: (path) => path.endsWith("connection.json") ? JSON.stringify({ url: "http://127.0.0.1:3010", tokenFile: "/token" }) : "test-token" } : require(id),
  });
  const context = { extensionPath: "/extension", subscriptions: [] };
  module.exports.activate(context);
  const send = async (event) => { response.emit("data", `${JSON.stringify(event)}\n`); await setImmediate(); };
  return { send, shown, commands, updates, document };
}

test("öffnet Dateiziele genau einmal, schützt Workspace-Grenzen und erhält Dirty-Dokumente", async () => {
  const fixtureState = await fixture();
  const event = { type: "editor.open", requestId: "request", file: "/projekt/datei.ts", line: 100, column: 100 };
  await fixtureState.send(event); await fixtureState.send(event);
  await fixtureState.send({ ...event, requestId: "foreign", file: "/projekt-anders/datei.ts" });
  await fixtureState.send({ ...event, requestId: "traversal", file: "/projekt/../secret" });
  assert.deepEqual(fixtureState.shown, ["/projekt/datei.ts"]);
  assert.equal(fixtureState.document.isDirty, true);
});

test("wendet Theme und Leistungsprofil nur nach explizitem Befehl an und erhält Overrides", async () => {
  const fixtureState = await fixture();
  assert.equal(fixtureState.updates.length, 0);
  await fixtureState.commands.get("wrapt.applyTheme")();
  await fixtureState.commands.get("wrapt.applyPerformance")();
  assert.equal(fixtureState.updates[0].value, "Wrapt Dark");
  assert.equal(fixtureState.updates[1].value["**/dist/**"], false);
  assert.equal(fixtureState.updates[1].value["**/coverage/**"], true);
  assert.equal(Object.hasOwn(fixtureState.updates[1].value, "**/src/**"), false);
});
