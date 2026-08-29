import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import { constants, brotliCompress, gzip } from "node:zlib";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const repositoryRoot = new URL("../../../", import.meta.url);
const configuredDistDirectory = process.env.WRAPT_E2E_WEB_OUT_DIR?.trim();
const distDirectory = configuredDistDirectory
  ? pathToFileURL(`${resolvePath(configuredDistDirectory)}/`)
  : new URL("../dist/", import.meta.url);

async function environmentDefaults() {
  try {
    const source = await readFile(new URL(".env", repositoryRoot), "utf8");
    return Object.fromEntries(source
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]));
  } catch {
    return {};
  }
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const url = new URL(entry.name, directory);
    return entry.isDirectory() ? filesBelow(new URL(`${entry.name}/`, directory)) : [url];
  }));
  return nested.flat();
}

const defaults = await environmentDefaults();
const threshold = Number(process.env.COMPRESSION_THRESHOLD_BYTES ?? defaults.COMPRESSION_THRESHOLD_BYTES ?? 1_024);
const quality = Number(process.env.BROTLI_QUALITY ?? defaults.BROTLI_QUALITY ?? 4);
const compressible = /\.(?:css|html|js|json|svg|webmanifest)$/;
const releaseIndexUrl = new URL(".wrapt-releases.json", distDirectory);
const buildManifestUrl = new URL("build-manifest.json", distDirectory);
const retentionMilliseconds = 24 * 60 * 60 * 1_000;
const maximumReleases = 3;
const compressionStartedAt = Date.now();

function safeUrl(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.?\//, "");
  if (!normalized || normalized.startsWith("../") || normalized.includes("/../")) return null;
  return new URL(normalized, distDirectory);
}

async function exists(url) {
  try { await stat(url); return true; } catch { return false; }
}

async function currentManifestFiles() {
  const files = new Set(["index.html", "build-manifest.json"]);
  try {
    const manifest = JSON.parse(await readFile(buildManifestUrl, "utf8"));
    const visit = (entry) => {
      if (!entry || typeof entry !== "object") return;
      for (const key of ["file", "css", "assets"]) {
        const values = Array.isArray(entry[key]) ? entry[key] : [entry[key]];
        for (const value of values) if (typeof value === "string") files.add(value);
      }
      for (const key of ["imports", "dynamicImports"]) {
        for (const imported of entry[key] ?? []) visit(manifest[imported]);
      }
    };
    for (const entry of Object.values(manifest)) visit(entry);
  } catch {
    // Ein beschädigtes Manifest darf den Build nicht in einen Teilzustand
    // schreiben; die Kompression bleibt dann bewusst auf index.html begrenzt.
  }
  for (const url of await filesBelow(distDirectory)) {
    const relativePath = url.pathname.slice(new URL(distDirectory).pathname.length);
    if (!relativePath.startsWith("assets/") && relativePath !== ".wrapt-releases.json") files.add(relativePath);
  }
  return [...files].map(safeUrl).filter(Boolean);
}

async function readReleases() {
  try {
    const value = JSON.parse(await readFile(releaseIndexUrl, "utf8"));
    if (!Array.isArray(value)) return [];
    return value.filter((release) => release && Number.isFinite(release.createdAt) && Array.isArray(release.files));
  } catch { return []; }
}

async function writeJsonAtomic(url, value) {
  const temporary = new URL(`${url.pathname}.${process.pid}.tmp`, url);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, url);
}

async function compress(url) {
  if (!url || !compressible.test(url.pathname)) return;
  const metadata = await stat(url);
  const targets = [new URL(`${url.pathname}.br`, url), new URL(`${url.pathname}.gz`, url)];
  if (metadata.size < threshold) {
    await Promise.all(targets.map((target) => rm(target, { force: true })));
    return;
  }
  const reusable = await Promise.all(targets.map(async (target) => {
    try { return (await stat(target)).mtimeMs >= metadata.mtimeMs; } catch { return false; }
  }));
  if (reusable.every(Boolean)) return;
  const source = await readFile(url);
  const [brotli, gzipped] = await Promise.all([
    compressBrotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }),
    compressGzip(source, { level: 9 }),
  ]);
  for (const [value, target] of [[brotli, targets[0]], [gzipped, targets[1]]]) {
    if (value.length >= source.length) {
      await rm(target, { force: true });
      continue;
    }
    if (await exists(target) && (await stat(target)).mtimeMs >= metadata.mtimeMs) continue;
    const temporary = new URL(`${target.pathname}.${process.pid}.tmp`, target);
    await writeFile(temporary, value);
    await rename(temporary, target);
  }
}

const currentUrls = await currentManifestFiles();
await Promise.all(currentUrls.map(compress));
const currentFiles = currentUrls.map((url) => url.pathname.slice(new URL(distDirectory).pathname.length));
const now = Date.now();
const releases = [...(await readReleases()), {
  id: createHash("sha256").update(currentFiles.sort().join("\n")).digest("hex").slice(0, 16),
  createdAt: now,
  durationMilliseconds: Date.now() - compressionStartedAt,
  files: currentFiles,
}].slice(-maximumReleases);
const protectedFiles = new Set(
  releases
    .filter((release, index) => index >= releases.length - maximumReleases || now - release.createdAt < retentionMilliseconds)
    .flatMap((release) => release.files.flatMap((file) => [file, `${file}.br`, `${file}.gz`])),
);
for (const url of await filesBelow(distDirectory)) {
  const relativePath = url.pathname.slice(new URL(distDirectory).pathname.length);
  if (!relativePath.startsWith("assets/") || protectedFiles.has(relativePath)) continue;
  try {
    if (now - (await stat(url)).mtimeMs >= retentionMilliseconds) await rm(url, { force: true });
  } catch { /* Best Effort: ein paralleler Build darf den Cleanup nicht stoppen. */ }
}
await writeJsonAtomic(releaseIndexUrl, releases);
