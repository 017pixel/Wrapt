import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { PluginCodeSourceStore } from "./code-source-store.js";
import { pluginCodeTemplate } from "./code-template.js";
import { buildPluginSourceInProcess } from "./code-build-process.js";

it("hält den Event-Loop beim Kompilieren frei und erhält den letzten Build nach Fehler und Timeout", async () => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-compiler-process-"));
  const store = new PluginCodeSourceStore(join(root, "sources"));
  const template = pluginCodeTemplate("personal.compiler", "Compiler-Test");
  const state = store.create({ ...template, expectedRevision: 0 });
  const options = { repositoryRoot: resolve("../.."), sourceDirectory: state.sourceDirectory, outputDirectory: join(root, "build") };
  let beats = 0;
  const timer = setInterval(() => { beats += 1; }, 10);
  try {
    const result = await buildPluginSourceInProcess(store.source(state.id), options, 30_000);
    expect(result.diagnostics).toEqual([]);
    expect(beats).toBeGreaterThan(5);
    const path = join(options.outputDirectory, "server/server.js");
    const before = readFileSync(path, "utf8");
    store.update(state.id, { ...template, expectedRevision: state.sourceRevision, files: template.files.map((file) => file.path === "server.ts" ? { ...file, content: "const broken: string = 123;" } : file) });
    const failed = await buildPluginSourceInProcess(store.source(state.id), options, 30_000);
    expect(failed.diagnostics.some((item) => item.severity === "error")).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(before);
    mkdirSync(join(root, "unchanged"));
    writeFileSync(join(root, "unchanged/marker"), "unberührt");
    await expect(buildPluginSourceInProcess({ ...template, revision: 1 }, { ...options, outputDirectory: join(root, "unchanged") }, 1)).rejects.toThrow(/lange gedauert/);
    expect(readFileSync(join(root, "unchanged/marker"), "utf8")).toBe("unberührt");
    expect(readdirSync(root).some((name) => name.includes(".compile-"))).toBe(false);
  } finally { clearInterval(timer); rmSync(root, { recursive: true, force: true }); }
}, 60_000);
