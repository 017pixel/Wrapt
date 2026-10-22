import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginCodeSourceStore } from "./code-source-store.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function store() {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-code-source-"));
  directories.push(directory);
  return new PluginCodeSourceStore(directory);
}
const definition = { formatVersion: 3, id: "personal.tasks", name: "Aufgaben", description: "Meine Aufgaben", version: "0.1.0", server: "server.ts" };
const files = [{ path: "server.ts", content: "export default { setup() {} };" }, { path: "helpers.ts", content: "export const label = 'Aufgaben';" }];

describe("persönliche Code-Quellen", () => {
  it("behält Quellen über einen neuen Store bei und zählt Lesen nicht als Änderung", () => {
    const first = store();
    expect(first.create({ expectedRevision: 0, definition, files })).toMatchObject({ sourceRevision: 1, trusted: false });
    expect(first.source("personal.tasks").revision).toBe(1);
    const reopened = new PluginCodeSourceStore(first.root);
    expect(reopened.list()).toHaveLength(1);
    expect(reopened.source("personal.tasks")).toMatchObject({ revision: 1, definition });
  });

  it("verweigert stale Writes und erhält den vorherigen Inhalt", () => {
    const service = store();
    service.create({ expectedRevision: 0, definition, files });
    service.update("personal.tasks", { expectedRevision: 1, definition: { ...definition, name: "Neu" }, files });
    expect(() => service.update("personal.tasks", { expectedRevision: 1, definition, files })).toThrow("inzwischen");
    expect(service.source("personal.tasks").definition.name).toBe("Neu");
  });

  it("verweigert Traversal, doppelte IDs und fehlende Einstiege", () => {
    const service = store();
    expect(() => service.create({ expectedRevision: 0, definition, files: [{ path: "../server.ts", content: "" }] })).toThrow();
    expect(() => service.create({ expectedRevision: 0, definition, files: [{ path: "unrelated.ts", content: "" }] })).toThrow();
    expect(() => service.create({ expectedRevision: 0, definition: { ...definition, server: "style.css" }, files: [{ path: "style.css", content: "button {}" }] })).toThrow("Einstiegspunkte");
    service.create({ expectedRevision: 0, definition, files });
    expect(() => service.create({ expectedRevision: 0, definition, files })).toThrow("bereits");
  });

  it("erkennt Editoränderungen und lehnt Symlinks ab", () => {
    const service = store();
    const state = service.create({ expectedRevision: 0, definition, files });
    writeFileSync(join(state.sourceDirectory, "server.ts"), "export default { setup() { return () => {}; } };");
    expect(service.source(state.id).revision).toBe(2);
    symlinkSync(join(state.sourceDirectory, "server.ts"), join(state.sourceDirectory, "linked.ts"));
    expect(() => service.source(state.id)).toThrow("Symlinks");
    expect(readFileSync(join(state.sourceDirectory, "server.ts"), "utf8")).toContain("setup()");
  });
});
