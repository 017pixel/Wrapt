import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareEditorExtension } from "./prepare-editor-extension.mjs";
import { themeFromCss } from "./lib/editor-theme.mjs";

test("überspringt eine vollständige Installation trotz VS-Code-Metadaten und anderer JSON-Formatierung", async () => {
  const root = await mkdtemp(join(tmpdir(), "wrapt-editor-install-test-"));
  try {
    const extension = join(root, "server/extensions/wrapt.wrapt-editor-1.0.0");
    await mkdir(extension, { recursive: true });
    await cp(new URL("../tools/vscode-wrapt/extension.cjs", import.meta.url), join(extension, "extension.cjs"));
    const manifest = JSON.parse(await readFile(new URL("../tools/vscode-wrapt/package.json", import.meta.url), "utf8"));
    manifest.__metadata = { installedTimestamp: 1 };
    await writeFile(join(extension, "package.json"), JSON.stringify(manifest, null, "\t"));
    await writeFile(join(root, "server/extensions/extensions.json"), JSON.stringify([{ identifier: { id: "wrapt.wrapt-editor" }, version: "1.0.0" }]));
    await writeFile(join(extension, "connection.json"), JSON.stringify({ url: "http://127.0.0.1:19410", tokenFile: "/nicht-gelesener-token" }));
    await writeFile(join(extension, "wrapt-dark.json"), JSON.stringify(themeFromCss(await readFile(new URL("../apps/web/src/index.css", import.meta.url), "utf8")), null, 2));
    await prepareEditorExtension({ dataDirectory: root, tokenFile: "/nicht-gelesener-token", port: 19410 });
    await assert.rejects(stat(join(root, "cli")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
