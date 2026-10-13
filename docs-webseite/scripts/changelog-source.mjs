import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function changelogArchivePaths(markdown) {
  return [...new Set([...markdown.matchAll(/\]\((docs\/changelog\/[a-zA-Z0-9.-]+\.md)\)/g)].map((match) => match[1]))];
}

export function releaseSections(markdown) {
  const archiveIndex = markdown.indexOf("\n## Ältere Versionen\n");
  if (archiveIndex >= 0) markdown = markdown.slice(0, archiveIndex);
  const starts = [...markdown.matchAll(/^##\s+\[([^\]]+)\]\s+-\s+(.+)$/gm)];
  return starts.map((match, index) => {
    const end = starts[index + 1]?.index ?? markdown.length;
    return { version: match[1].trim(), date: match[2].trim(), body: markdown.slice(match.index, end).trim() };
  });
}

/** Aktuelle und archivierte Abschnitte bleiben dieselbe vollständige Historie. */
export async function readChangelogReleases(repositoryRoot) {
  const current = await readFile(join(repositoryRoot, "CHANGELOG.md"), "utf8");
  const archives = await Promise.all(changelogArchivePaths(current).map((path) => readFile(join(repositoryRoot, path), "utf8")));
  const releases = [current, ...archives].flatMap(releaseSections);
  if (new Set(releases.map((release) => release.version)).size !== releases.length) {
    throw new Error("Die Changelog-Historie enthält doppelte Versionen.");
  }
  return releases;
}
