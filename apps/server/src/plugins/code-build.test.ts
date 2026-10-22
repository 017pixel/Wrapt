import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPluginSource } from "./code-build.js";
import { PluginCodeSourceStore } from "./code-source-store.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-plugin-build-"));
  directories.push(directory);
  const store = new PluginCodeSourceStore(join(directory, "sources"));
  return { store, directory };
}
const definition = { formatVersion: 3, id: "personal.monitor", name: "Monitor", description: "Mein Monitor", version: "0.1.0", server: "server.ts", ui: "ui.tsx" };
const files = [
  { path: "server.ts", content: 'import { definePlugin } from "@wrapt/plugin-sdk"; import { basename } from "node:path"; export default definePlugin({ setup(ctx) { ctx.log.info(basename(ctx.paths.data)); } });' },
  { path: "ui.tsx", content: 'import { defineClientPlugin } from "@wrapt/plugin-sdk/client"; import { useState } from "react"; import { title } from "./label.js"; export default defineClientPlugin({ setup(ctx) { ctx.ui.register({ id: "main", surface: "page", title, Component: () => { const [n] = useState(1); return <button>{n}</button>; } }); } });' },
  { path: "label.ts", content: 'export const title = "Mein Monitor";' },
];

describe("lokaler Plugin-Build", () => {
  it("baut getrennte Modulgraphen und verwendet das Host-React", () => {
    const { store, directory } = fixture();
    const state = store.create({ expectedRevision: 0, definition, files });
    const output = buildPluginSource(store.source(state.id), { repositoryRoot: resolve("../.."), sourceDirectory: state.sourceDirectory, outputDirectory: join(directory, "release") });
    expect(output.diagnostics).toEqual([]);
    const client = readFileSync(join(output.directory, "client/ui.js"), "utf8");
    expect(client).toContain("/api/v1/plugins/sdk/react.js");
    expect(client).toContain("__wraptPluginReact.createElement");
    expect(client).toContain("./label.js");
    expect(readFileSync(join(output.directory, "server/server.js"), "utf8")).toContain("node:path");
  }, 30_000);

  it("liefert echte SDK-Typfehler und überschreibt keinen erfolgreichen Build", () => {
    const { store, directory } = fixture();
    const state = store.create({ expectedRevision: 0, definition, files });
    const options = { repositoryRoot: resolve("../.."), sourceDirectory: state.sourceDirectory, outputDirectory: join(directory, "release") };
    buildPluginSource(store.source(state.id), options);
    const before = readFileSync(join(options.outputDirectory, "server/server.js"), "utf8");
    store.update(state.id, { expectedRevision: 1, definition, files: files.map((file) => file.path === "server.ts" ? { ...file, content: 'import { definePlugin } from "@wrapt/plugin-sdk"; export default definePlugin({ setup(ctx) { ctx.nonexistent(); } });' } : file) });
    const failed = buildPluginSource(store.source(state.id), options);
    expect(failed.diagnostics.some((diagnostic) => diagnostic.message.includes("nonexistent"))).toBe(true);
    expect(readFileSync(join(options.outputDirectory, "server/server.js"), "utf8")).toBe(before);
  }, 30_000);
});
