import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = resolve(here, "..");
const repoRoot = resolve(docsDir, "..");
const source = join(repoRoot, "CHANGELOG.md");
const releaseDir = join(docsDir, "content/changelog/releases");

function releasesFrom(markdown) {
  const starts = [...markdown.matchAll(/^##\s+\[([^\]]+)\]\s+-\s+(.+)$/gm)];
  return starts.map((match, index) => {
    const start = match.index;
    const end = starts[index + 1]?.index ?? markdown.length;
    return {
      version: match[1].trim(),
      date: match[2].trim(),
      body: markdown.slice(start, end).trim(),
    };
  });
}

async function main() {
  const markdown = await readFile(source, "utf8");
  const releases = releasesFrom(markdown);
  if (!releases.length) throw new Error("CHANGELOG.md enthält keine Versionsabschnitte.");

  await mkdir(releaseDir, { recursive: true });
  const existing = (await readdir(releaseDir)).filter((name) => /^release-.+\.md$/.test(name));
  await Promise.all(existing.map((name) => rm(join(releaseDir, name))));

  for (const release of releases) {
    const filename = `release-${release.version}-${release.date}.md`;
    const contents = release.body.replace(/^##\s+/, "# ");
    await writeFile(join(releaseDir, filename), `${contents}\n`);
  }

  console.log(`${releases.length} Versionen aus CHANGELOG.md übernommen.`);
}

main().catch((error) => {
  console.error(`Changelog-Synchronisierung fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
