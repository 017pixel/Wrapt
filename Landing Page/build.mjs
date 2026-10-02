// build.mjs — erzeugt die statische Ausgabe der Wrapt-Landingpage in dist/.
//
// Liest die Theme-Token aus apps/web/src/index.css, ersetzt damit den markierten
// @theme-Block in styles.css, kopiert Assets und lokale Fonts und schreibt die
// fertige Seite nach Landing Page/dist/. Keine Netzwerk- oder API-Zugriffe.

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const themePath = resolve(repoRoot, "apps/web/src/index.css");
const distDir = join(here, "dist");
const assetsDir = join(here, "assets");
const publicSiteRoot = "https://017pixel.github.io/Wrapt";

const FONT_DIR = "assets/fonts";
const FONTS = [
  ["@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2", "dm-sans-latin-wght-normal.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2", "jetbrains-mono-latin-400-normal.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2", "jetbrains-mono-latin-500-normal.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2", "jetbrains-mono-latin-600-normal.woff2"],
];

function fail(message) {
  console.error(`Build abgebrochen: ${message}`);
  process.exit(1);
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function readBlock(css, startMarker, label) {
  const start = css.indexOf(startMarker);
  if (start === -1) fail(`${label} nicht gefunden`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    const char = css[i];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return fail(`Ende von ${label} nicht gefunden`);
}

function extractTheme(css) {
  const block = readBlock(css, "@theme", "@theme-Block");
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const pattern = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  const tokens = new Map();
  let match = pattern.exec(clean);
  while (match) {
    tokens.set(`--${match[1]}`, normalize(match[2]));
    match = pattern.exec(clean);
  }
  if (!tokens.size) fail("keine Theme-Token in index.css gefunden");
  return tokens;
}

function themeRoot(tokens) {
  const lines = [":root {"];
  for (const [name, value] of tokens) lines.push(`  ${name}: ${value};`);
  lines.push("}");
  return lines.join("\n");
}

function injectTheme(css, tokens) {
  const startMarker = "/* @theme:start";
  const endMarker = "/* @theme:end */";
  const start = css.indexOf(startMarker);
  const end = css.indexOf(endMarker);
  if (start === -1 || end === -1) fail("Theme-Marker in styles.css fehlen");
  const head = css.slice(0, css.indexOf("*/", start) + 2);
  const tail = css.slice(end);
  return `${head}\n${themeRoot(tokens)}\n${tail}`;
}

function sitemapXml() {
  const urls = [`${publicSiteRoot}/`, `${publicSiteRoot}/doku/`];
  const entries = urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function robotsTxt() {
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${publicSiteRoot}/sitemap.xml`,
    "",
  ].join("\n");
}

async function copyFonts() {
  const target = join(distDir, FONT_DIR);
  const localDir = join(assetsDir, "fonts");
  await mkdir(target, { recursive: true });
  const missing = [];
  for (const [source, name] of FONTS) {
    const local = join(localDir, name);
    const from = existsSync(local) ? local : resolve(repoRoot, "apps/web/node_modules", source);
    if (existsSync(from)) {
      await cp(from, join(target, name));
    } else {
      missing.push(name);
    }
  }
  if (missing.length) {
    console.warn(`Warnung: ${missing.length} Font-Datei(en) fehlen, der System-Fallback greift: ${missing.join(", ")}`);
  }
  return FONTS.length - missing.length;
}

async function build() {
  const themeCss = await readFile(themePath, "utf8").catch(() => fail("apps/web/src/index.css nicht lesbar"));
  const tokens = extractTheme(themeCss);

  const [html, styles, docsStyles, script] = await Promise.all([
    readFile(join(here, "index.html"), "utf8"),
    readFile(join(here, "styles.css"), "utf8"),
    readFile(join(here, "docs.css"), "utf8"),
    readFile(join(here, "script.js"), "utf8"),
  ]);
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await cp(assetsDir, join(distDir, "assets"), { recursive: true });
  await writeFile(join(distDir, "index.html"), html);
  await writeFile(join(distDir, "styles.css"), injectTheme(styles, tokens));
  await writeFile(join(distDir, "docs.css"), docsStyles);
  await writeFile(join(distDir, "script.js"), script);
  await writeFile(join(distDir, ".nojekyll"), "");
  const fontCount = await copyFonts();

  execFileSync(process.execPath, [resolve(repoRoot, "docs-webseite/build.mjs")], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  await cp(resolve(repoRoot, "docs-webseite/dist"), join(distDir, "doku"), { recursive: true });
  await Promise.all([
    writeFile(join(distDir, "sitemap.xml"), sitemapXml()),
    writeFile(join(distDir, "robots.txt"), robotsTxt()),
    cp(resolve(repoRoot, "docs-webseite/dist/llms.txt"), join(distDir, "llms.txt")),
    cp(resolve(repoRoot, "docs-webseite/dist/llms-full.txt"), join(distDir, "llms-full.txt")),
  ]);

  console.log(`Fertig: ${tokens.size} Theme-Token übernommen, ${fontCount} Fonts kopiert, Doku unter /doku gebündelt.`);
  console.log("Discovery: sitemap.xml, robots.txt, llms.txt und llms-full.txt erzeugt.");
  console.log(`Ausgabe: ${distDir}`);
}

build().catch((error) => fail(error && error.message ? error.message : String(error)));
