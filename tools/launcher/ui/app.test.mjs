import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("./app.js", import.meta.url), "utf8");

async function launcher(ownership = "external") {
  const elements = new Map();
  const calls = [];
  const tasks = [];
  const errors = [];
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", textContent: "", dataset: {}, disabled: false,
      listeners: {}, classList: { toggle() {} },
      addEventListener(name, handler) { this.listeners[name] = handler; },
    });
    return elements.get(id);
  };
  runInNewContext(source, {
    document: { getElementById: element, activeElement: null },
    window: {
      __TAURI__: { core: { invoke: async (name, args) => {
        calls.push({ name, args });
        if (name === "get_status") return {
          repository: "/projects/Wrapt", logFile: "/data/server.log",
          reachable: true, version: "2.1.6", bootId: "boot", ownership,
        };
        if (name === "get_autostart") return true;
        return "Erledigt";
      } } },
      setInterval(callback) { tasks.push(callback); },
    },
    console: { error: (error) => errors.push(error) },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { element, calls, errors, refresh: tasks[0] };
}

test("zeigt den Status eines externen Servers und schützt dessen Prozess", async () => {
  const { element, errors } = await launcher();
  assert.equal(element("status-title").textContent, "Wrapt ist erreichbar");
  assert.equal(element("log-path").textContent, "/data/server.log");
  assert.equal(element("repository").value, "/projects/Wrapt");
  assert.equal(element("autostart").checked, true);
  assert.equal(element("start-server").disabled, true);
  assert.equal(element("stop-server").disabled, true);
  assert.equal(element("restart-server").disabled, true);
  assert.deepEqual(errors, []);
});

test("bindet Aktionen an ihre DOM-Buttons und übergibt den eingegebenen Pfad", async () => {
  const { element, calls } = await launcher("managed");
  assert.equal(element("stop-server").disabled, false);
  assert.equal(element("restart-server").disabled, false);
  element("repository").value = "/projects/anderes-wrapt";
  element("save-path").listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  const call = calls.find(({ name }) => name === "set_repository_path");
  assert.equal(call.args.repoPath, "/projects/anderes-wrapt");
  await element("open-workbench").listeners.click();
  assert.ok(calls.some(({ name }) => name === "open_workbench"));
});
