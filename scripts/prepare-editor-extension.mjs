import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { themeFromCss } from "./lib/editor-theme.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(binary, args, cwd) {
  return new Promise((done, reject) => {
    const child = spawn(binary, args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? done() : reject(new Error(`Editor-Erweiterung: Exit ${code}`)));
  });
}

async function serverInstallation(dataDirectory) {
  const cache = join(dataDirectory, "cli/serve-web");
  await mkdir(cache, { recursive: true });
  const candidates = await Promise.all((await readdir(cache)).filter((name) => /^[a-f0-9]{40}$/.test(name))
    .map(async (name) => {
      const path = join(cache, name);
      try { await access(join(path, "bin/code-server")); }
      catch (error) { if (error.code === "ENOENT") return null; throw error; }
      return { path, modified: (await stat(path)).mtimeMs };
    }));
  const installations = candidates.filter((entry) => entry !== null);
  if (installations.length) return installations.sort((a, b) => b.modified - a.modified)[0].path;
  const platform = { linux: "linux", darwin: "darwin" }[process.platform];
  if (!platform || !["x64", "arm64"].includes(process.arch)) throw new Error("VS-Code-Web unterstützt diese Plattform hier nicht.");
  const response = await fetch(`https://update.code.visualstudio.com/api/update/server-${platform}-${process.arch}-web/stable/latest`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`VS-Code-Metadaten: HTTP ${response.status}`);
  const metadata = await response.json();
  if (!/^[a-f0-9]{40}$/.test(metadata.version)) throw new Error("Ungültiger VS-Code-Commit.");
  const temporary = await mkdtemp(join(cache, ".download-"));
  const destination = join(cache, metadata.version);
  try {
    const downloadUrl = new URL(metadata.url);
    if (downloadUrl.protocol !== "https:" || !["vscode.download.prss.microsoft.com", "update.code.visualstudio.com"].includes(downloadUrl.hostname)) {
      throw new Error("Nicht unterstützte offizielle VS-Code-Downloadadresse.");
    }
    const download = await fetch(downloadUrl, { signal: AbortSignal.timeout(120_000) });
    if (!download.ok) throw new Error(`VS-Code-Web-Download: HTTP ${download.status}`);
    const archive = join(temporary, "server.tar.gz");
    await writeFile(archive, Buffer.from(await download.arrayBuffer()));
    const extracted = join(temporary, "server");
    await mkdir(extracted);
    await run("tar", ["-xzf", archive, "--strip-components=1", "-C", extracted], repository);
    await access(join(extracted, "bin/code-server"));
    try { await rename(extracted, destination); } catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
      await access(join(destination, "bin/code-server"));
    }
    return destination;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

/** Installiert ausschließlich die eigene Erweiterung; keine Profiländerungen. */
export async function prepareEditorExtension({ dataDirectory, tokenFile, port }) {
  const temporary = await mkdtemp(join(tmpdir(), "wrapt-editor-extension-"));
  const stage = join(temporary, "extension");
  try {
    await cp(join(repository, "tools/vscode-wrapt"), stage, { recursive: true, filter: (path) => !path.endsWith(".test.cjs") });
    const css = await readFile(join(repository, "apps/web/src/index.css"), "utf8");
    await writeFile(join(stage, "wrapt-dark.json"), JSON.stringify(themeFromCss(css), null, 2));
    await writeFile(join(stage, "connection.json"), JSON.stringify({ url: `http://127.0.0.1:${port}`, tokenFile }), { mode: 0o600 });
    const manifest = JSON.parse(await readFile(join(stage, "package.json"), "utf8"));
    const installed = join(dataDirectory, `server/extensions/${manifest.publisher}.${manifest.name}-${manifest.version}`);
    const files = ["extension.cjs", "connection.json", "wrapt-dark.json"];
    let manifestMatches = false;
    try {
      const current = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
      delete current.__metadata;
      const registry = JSON.parse(await readFile(join(dataDirectory, "server/extensions/extensions.json"), "utf8"));
      manifestMatches = isDeepStrictEqual(current, manifest) && registry.some((entry) =>
        entry.identifier?.id === `${manifest.publisher}.${manifest.name}` && entry.version === manifest.version);
    } catch { /* Fehlende oder unvollständige Installation neu vorbereiten. */ }
    const unchanged = await Promise.all(files.map(async (file) => {
      try { return (await readFile(join(stage, file))).equals(await readFile(join(installed, file))); }
      catch { return false; }
    }));
    if (manifestMatches && unchanged.every(Boolean)) return;
    await writeFile(join(temporary, "extension.vsixmanifest"), `<?xml version="1.0"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="de-DE" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}"/><DisplayName>Wrapt Editor</DisplayName><Description xml:space="preserve">Wrapt Editor</Description></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>`);
    await writeFile(join(temporary, "[Content_Types].xml"), '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>');
    const archive = join(temporary, "wrapt-editor.vsix");
    await run("zip", ["-qr", archive, "extension", "extension.vsixmanifest", "[Content_Types].xml"], temporary);
    await mkdir(join(dataDirectory, "server"), { recursive: true });
    // Die Standalone-CLI kann ext-Befehle an ein fremdes `code` im PATH
    // weitergeben (in Wrapt ist das der T3-Shim). Den Server-CLI direkt nutzen.
    const installation = await serverInstallation(dataDirectory);
    await run(join(installation, "bin/code-server"), ["--extensions-dir", join(dataDirectory, "server/extensions"), "--user-data-dir", join(dataDirectory, "server/data"), "--install-extension", archive, "--force"], repository);
    await access(join(installed, "package.json"));
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
