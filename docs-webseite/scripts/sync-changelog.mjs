import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readChangelogReleases } from "./changelog-source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = resolve(here, "..");
const repoRoot = resolve(docsDir, "..");
const releaseDir = join(docsDir, "content/changelog/releases");

async function main() {
  const releases = await readChangelogReleases(repoRoot);
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
