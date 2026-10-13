import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { changelogArchivePaths, readChangelogReleases, releaseSections } from "./changelog-source.mjs";

test("erhält Releasekörper ohne Archivüberschrift und liest die gesamte Historie", async () => {
  const root = await mkdtemp(join(tmpdir(), "wrapt-changelog-"));
  try {
    await mkdir(join(root, "docs/changelog"), { recursive: true });
    await writeFile(join(root, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n## [2.2.10] - 2026-10-12\n\n### Behoben\n- Neu\n\n## Ältere Versionen\n\n- [Archiv](docs/changelog/alt.md)\n");
    await writeFile(join(root, "docs/changelog/alt.md"), "# Archiv\n\n[Zurück](../../CHANGELOG.md)\n\n## [2.2.9] - 2026-10-08\n\n### Verändert\n- Alt\n");
    assert.deepEqual(await readChangelogReleases(root), [
      { version: "2.2.10", date: "2026-10-12", body: "## [2.2.10] - 2026-10-12\n\n### Behoben\n- Neu" },
      { version: "2.2.9", date: "2026-10-08", body: "## [2.2.9] - 2026-10-08\n\n### Verändert\n- Alt" },
    ]);
    await writeFile(join(root, "docs/changelog/alt.md"), "## [2.2.10] - 2026-10-12\n- Duplikat\n");
    await assert.rejects(readChangelogReleases(root), /doppelte Versionen/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("bewahrt die flache Historie und erlaubt ausschließlich eindeutige Archivpfade", () => {
  assert.equal(releaseSections("## [1.0.0] - 2026-01-01\n- Unverändert\n")[0].body, "## [1.0.0] - 2026-01-01\n- Unverändert");
  assert.deepEqual(changelogArchivePaths("[A](docs/changelog/alt.md) [B](docs/changelog/alt.md) [C](docs/changelog/../../privat.md)"), ["docs/changelog/alt.md"]);
  const historic = "## [1.0.0] - 2026-01-01\n- Alt\n\n## Unreleased\n- Historischer Bestand";
  assert.equal(releaseSections(historic)[0].body, historic);
});
