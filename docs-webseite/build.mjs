import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, renderMarkdown } from "./src/markdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const sourceDir = join(here, "src");
const contentDir = join(here, "content");
const assetsDir = join(here, "assets");
const distDir = join(here, "dist");
const themeFile = join(repoRoot, "apps/web/src/index.css");
// Das Doku-Capybara nutzt dieselben Sprites wie die Workbench; der Build kopiert
// sie aus der App, damit es keine doppelte Quelle gibt.
const mascotAssetsDir = join(repoRoot, "apps/web/src/components/mascot/assets");
const publicSiteRoot = "https://017pixel.github.io/Wrapt";
const publicDocsRoot = `${publicSiteRoot}/doku`;

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

function publicMarkdownUrl(id) {
  return `${publicDocsRoot}/markdown/${id}.md`;
}

function llmMarkdown(markdown, source, pageIds, assetNames) {
  const rewriteTarget = (target, asImage = false) => {
    const trimmed = target.trim();
    if (!trimmed || /^(?:https:\/\/|mailto:|data:)/i.test(trimmed) || trimmed.startsWith("#")) return trimmed;

    const [pathPart, ...hashParts] = trimmed.split("#");
    const anchor = hashParts.length ? `#${hashParts.join("#")}` : "";

    if (asImage) {
      const filename = pathPart.match(/(?:^|\/)assets\/([^/]+)$/)?.[1];
      if (filename && assetNames.has(filename)) {
        return `${publicDocsRoot}/assets/${encodeURIComponent(filename)}${anchor}`;
      }
      return trimmed;
    }

    const resolved = resolve(contentDir, dirname(source), pathPart);
    if (!resolved.startsWith(`${contentDir}${sep}`) && resolved !== contentDir) return trimmed;
    const relativeSource = relative(contentDir, resolved).replaceAll(sep, "/");
    if (!relativeSource.endsWith(".md")) return trimmed;
    const id = pageIds.get(relativeSource);
    return id ? `${publicMarkdownUrl(id)}${anchor}` : trimmed;
  };

  return markdown
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, target) => `![${alt}](${rewriteTarget(target, true)})`)
    .replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, target) => `[${label}](${rewriteTarget(target)})`);
}

function llmsIndex(llmPages) {
  const lines = [
    "# Wrapt",
    "",
    "> Selbst gehostete Remote-Development-Workbench für Projekte, Terminals, Editoren, Coding-Agenten, Previews, Dateien, Automatisierungen und Systemdiagnose.",
    "",
    "## Dokumentation",
  ];

  for (const page of llmPages) {
    const summary = plainText(page.markdown).slice(0, 180);
    lines.push(`- [${page.title}](${publicMarkdownUrl(page.id)}): ${summary}`);
  }

  lines.push(
    "",
    "## Volltext",
    `- [Komplette Dokumentation in einer Datei](${publicDocsRoot}/llms-full.txt)`,
    "",
    "## Quellcode",
    "- [GitHub Repository](https://github.com/017pixel/Wrapt)",
    "",
  );
  return lines.join("\n");
}

function llmsFullText(llmPages) {
  const header = [
    "# Wrapt Dokumentation",
    "",
    "> Vollständige, maschinenlesbare Fassung der öffentlichen Wrapt-Dokumentation.",
    "",
  ].join("\n");

  const body = llmPages
    .map((page) => `<!-- ${publicMarkdownUrl(page.id)} -->\n\n${page.markdown.trim()}`)
    .join("\n\n---\n\n");

  return `${header}${body}\n`;
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
  const llmPages = [];

  for (const item of items) {
    const file = join(contentDir, item.source);
    if (!existsSync(file)) fail(`Navigationsseite fehlt: content/${item.source}`);
    const markdown = await readFile(file, "utf8");
    if (item.heroImage && !assetNames.has(item.heroImage)) fail("Titelbild fehlt: assets/" + item.heroImage);
    const title = firstTitle(markdown, item.id.split("/").at(-1));
    const content = renderMarkdown(markdown, item.source, pageIds, contentDir, assetNames, { leadFirstParagraph: item.id === "start" || Boolean(item.heroImage) });
    const releaseData = item.id === "changelog" ? await buildReleases(pageIds, assetNames) : { html: "", search: "" };
    llmPages.push({
      id: item.id,
      title,
      group: item.group,
      markdown: llmMarkdown(markdown, item.source, pageIds, assetNames),
    });
    pages.push({
      id: item.id,
      title,
      group: item.group,
      heroImage: item.heroImage ?? "",
      content: `${content}${releaseData.html}`,
      search: `${plainText(markdown)} ${releaseData.search}`,
    });
  }

  if (!existsSync(mascotAssetsDir)) fail("Capybara-Sprites fehlen: apps/web/src/components/mascot/assets");

  const [html, app, capybara, capybaraMotion, shell, capybaraCss, contentCss, responsive, sourceTheme] = await Promise.all([
    readFile(join(sourceDir, "index.html"), "utf8"),
    readFile(join(sourceDir, "app.js"), "utf8"),
    readFile(join(sourceDir, "capybara.js"), "utf8"),
    readFile(join(sourceDir, "capybaraMotion.js"), "utf8"),
    readFile(join(sourceDir, "shell.css"), "utf8"),
    readFile(join(sourceDir, "capybara.css"), "utf8"),
    readFile(join(sourceDir, "content.css"), "utf8"),
    readFile(join(sourceDir, "responsive.css"), "utf8"),
    readFile(themeFile, "utf8"),
  ]);

  await rm(distDir, { recursive: true, force: true });
  await mkdir(join(distDir, "data"), { recursive: true });
  await cp(assetsDir, join(distDir, "assets"), { recursive: true });
  await cp(mascotAssetsDir, join(distDir, "assets/capybara"), { recursive: true });
  await writeFile(join(distDir, "index.html"), html);
  await writeFile(join(distDir, "app.js"), app);
  await writeFile(join(distDir, "capybara.js"), capybara);
  await writeFile(join(distDir, "capybaraMotion.js"), capybaraMotion);
  await writeFile(join(distDir, "shell.css"), shell);
  await writeFile(join(distDir, "capybara.css"), capybaraCss);
  await writeFile(join(distDir, "content.css"), contentCss);
  await writeFile(join(distDir, "responsive.css"), responsive);
  await writeFile(join(distDir, "theme.css"), makeTheme(sourceTheme));
  await writeFile(join(distDir, "data/pages.json"), JSON.stringify({ groups, pages }));
  for (const page of llmPages) {
    const target = join(distDir, "markdown", `${page.id}.md`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${page.markdown.trim()}\n`);
  }
  await writeFile(join(distDir, "llms.txt"), llmsIndex(llmPages));
  await writeFile(join(distDir, "llms-full.txt"), llmsFullText(llmPages));
  await writeFile(join(distDir, ".nojekyll"), "");
  console.log(`Doku gebaut: ${pages.length} Seiten, ${assetNames.size} Assets, ${llmPages.length} Markdown-Endpunkte.`);
  console.log(`Ausgabe: ${distDir}`);
}

build().catch((error) => fail(error instanceof Error ? error.message : String(error)));
