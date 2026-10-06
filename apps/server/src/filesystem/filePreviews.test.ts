import { expect, it } from "vitest";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMediaPreview, readTextPreview } from "./filePreviews.js";

it("weist Suffix-Bereiche leerer Dateien kontrolliert zurück", () => {
  expect(() => openMediaPreview("/unused", 0, "bytes=-10")).toThrow(expect.objectContaining({ statusCode: 416, code: "FILESYSTEM_RANGE_INVALID" }));
});


it("fügt nach gleichzeitigem Kürzen einer Datei keine Nullbytes in die Textvorschau ein", async () => {
  const root = await mkdtemp(join(tmpdir(), "wrapt-text-preview-"));
  try {
    const path = join(root, "note.txt");
    await writeFile(path, "langer Text");
    const details = await stat(path);
    await writeFile(path, "kurz");
    expect((await readTextPreview(path, details, 4096)).text).toBe("kurz");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
