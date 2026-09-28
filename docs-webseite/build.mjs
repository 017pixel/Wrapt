import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, renderMarkdown } from "./src/markdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const sourceDir = join(here, "src");
const contentDir = join(here, "content");
const assetsDir = join(here, "assets");
const distDir = join(here, "dist");
const themeFile = join(repoRoot, "apps/web/src/index.css");

function fail(message) {
  console.error(`Doku-Build abgebrochen: ${message}`);
  process.exit(1);
}

function readBlock(css, marker) {
  const start = css.indexOf(marker);
  const open = css.indexOf("{", start);
  if (start < 0 || open < 0) fail(`${marker} nicht gefunden`);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  fail(`Ende von ${marker} fehlt`);
}

function makeTheme(css) {
  const body = readBlock(css, "@theme").replace(/\/\*[\s\S]*?\*\//g, "");
  const pattern = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  const tokens = [];
  let match = pattern.exec(body);
  while (match) {
    tokens.push(`  --${match[1]}: ${match[2].replace(/\s+/g, " ").trim()};`);
    match = pattern.exec(body);
  }
  if (!tokens.length) fail("Keine Design-Tokens in apps/web/src/index.css gefunden");
  return `:root {\n${tokens.join("\n")}\n}\n`;
}

function flattenGroups(groups) {
  return groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title })));
}

function firstTitle(markdown, fallback) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback;
}

function plainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function releaseVersion(markdown, filename) {
  const match = markdown.match(/^#\s+\[([^\]]+)\]\s+-\s+(.+)$/m);
  if (!match) fail(`Changelog-Datei ohne Versionskopf: ${filename}`);
  return { version: match[1].trim(), date: match[2].trim() };
}

function versionSet(markdown) {
  return new Set([...markdown.matchAll(/^##?\s+\[([^\]]+)\]\s+-\s+.+$/gm)].map((match) => match[1].trim()));
}

function publishedVersions() {
  try {
    const tracked = execFileSync("git", ["show", "HEAD:CHANGELOG.md"], { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
    return versionSet(tracked);
  } catch {
    return new Set();
  }
}

async function listMarkdown(directory, prefix = "") {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...await listMarkdown(join(directory, entry.name), relative));
    else if (entry.isFile() && entry.name.endsWith(".md")) output.push(relative.replaceAll("\\", "/"));
  }
  return output;
}

async function buildReleases(pageIds, assetNames) {
  const releaseDir = join(contentDir, "changelog/releases");
  if (!existsSync(releaseDir)) return { html: "", search: "" };
  const files = (await readdir(releaseDir)).filter((name) => name.endsWith(".md"));
  const releases = [];
  const publicVersionSet = publishedVersions();
  for (const filename of files) {
    const source = `changelog/releases/${filename}`;
    const markdown = await readFile(join(contentDir, source), "utf8");
    const { version, date } = releaseVersion(markdown, filename);
    const body = markdown.replace(/^#\s+\[[^\]]+\]\s+-\s+.+\n?/, "");
    const categories = [...body.matchAll(/^###\s+(Erstellt|Verändert|Gelöscht|Behoben)/gm)].map((item) => item[1]);
    const summary = body.match(/^[-*+]\s+(.+)$/m)?.[1] ?? "Änderungen und Korrekturen";
    const html = renderMarkdown(body, source, pageIds, contentDir, assetNames, { headingOffset: 1 });
    releases.push({ version, date, categories, summary: plainText(summary), html, search: plainText(body), published: publicVersionSet.has(version) });
  }

  releases.sort((a, b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version, undefined, { numeric: true }));
  const html = releases.map((release) => {
    const categories = release.categories.join(" ").toLocaleLowerCase("de-DE");
    const state = release.published ? "" : '<span class="release__state">Arbeitsstand</span>';
    const searchable = `${release.version} ${release.date} ${release.search}`.toLocaleLowerCase("de-DE");
    return `<details class="release" data-release data-categories="${escapeHtml(categories)}" data-search="${escapeHtml(searchable)}"><summary><span class="release__meta"><span class="release__version">${escapeHtml(release.version)}</span><time class="release__date">${escapeHtml(release.date)}</time>${state}</span><span class="release__summary">${escapeHtml(release.summary)}</span></summary><div class="release__body prose">${release.html}</div></details>`;
  }).join("\n");
  const filterTools = `<div class="release-tools"><label class="visually-hidden" for="release-search">Änderungen durchsuchen</label><input class="release-search" id="release-search" type="search" placeholder="Version oder Änderung suchen" /><div class="release-filters" role="group" aria-label="Nach Änderungstyp filtern"><button class="release-filter" type="button" data-release-filter="all" aria-pressed="true">Alle</button><button class="release-filter" type="button" data-release-filter="erstellt" aria-pressed="false">Erstellt</button><button class="release-filter" type="button" data-release-filter="verändert" aria-pressed="false">Verändert</button><button class="release-filter" type="button" data-release-filter="gelöscht" aria-pressed="false">Gelöscht</button><button class="release-filter" type="button" data-release-filter="behoben" aria-pressed="false">Behoben</button></div></div><p class="release-count" aria-live="polite">${releases.length} Versionen</p><div class="release-list">${html}</div><p class="release-empty" hidden>Keine Änderungen passen zu diesem Filter.</p>`;
  return { html: filterTools, search: releases.map((release) => `${release.version} ${release.date} ${release.search}`).join(" ") };
}

async function build() {
  const groups = JSON.parse(await readFile(join(sourceDir, "navigation.json"), "utf8"));
  const items = flattenGroups(groups);
  const pageIds = new Map(items.map((item) => [item.source, item.id]));
  const assetNames = new Set(await readdir(assetsDir));
  const pages = [];

  for (const item of items) {
    const file = join(contentDir, item.source);
    if (!existsSync(file)) fail(`Navigationsseite fehlt: content/${item.source}`);
    const markdown = await readFile(file, "utf8");
    const title = firstTitle(markdown, item.id.split("/").at(-1));
    const content = renderMarkdown(markdown, item.source, pageIds, contentDir, assetNames, { leadFirstParagraph: item.id === "start" });
    const releaseData = item.id === "changelog" ? await buildReleases(pageIds, assetNames) : { html: "", search: "" };
    pages.push({
      id: item.id,
      title,
      group: item.group,
      content: `${content}${releaseData.html}`,
      search: `${plainText(markdown)} ${releaseData.search}`,
    });
  }

  const [html, app, shell, contentCss, responsive, sourceTheme] = await Promise.all([
    readFile(join(sourceDir, "index.html"), "utf8"),
    readFile(join(sourceDir, "app.js"), "utf8"),
    readFile(join(sourceDir, "shell.css"), "utf8"),
    readFile(join(sourceDir, "content.css"), "utf8"),
    readFile(join(sourceDir, "responsive.css"), "utf8"),
    readFile(themeFile, "utf8"),
  ]);

  await rm(distDir, { recursive: true, force: true });
  await mkdir(join(distDir, "data"), { recursive: true });
  await cp(assetsDir, join(distDir, "assets"), { recursive: true });
  await writeFile(join(distDir, "index.html"), html);
  await writeFile(join(distDir, "app.js"), app);
  await writeFile(join(distDir, "shell.css"), shell);
  await writeFile(join(distDir, "content.css"), contentCss);
  await writeFile(join(distDir, "responsive.css"), responsive);
  await writeFile(join(distDir, "theme.css"), makeTheme(sourceTheme));
  await writeFile(join(distDir, "data/pages.json"), JSON.stringify({ groups, pages }));
  await writeFile(join(distDir, ".nojekyll"), "");
  console.log(`Doku gebaut: ${pages.length} Seiten, ${assetNames.size} Assets.`);
  console.log(`Ausgabe: ${distDir}`);
}

build().catch((error) => fail(error instanceof Error ? error.message : String(error)));
