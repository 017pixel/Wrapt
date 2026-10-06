import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "./markdown.mjs";

test("bricht bei einer leeren Markdown-Überschrift nicht den Doku-Build ab", () => {
  const result = renderMarkdown("# \n\n## Weiter\nInhalt", "index.md", new Map([["index.md", "start"]]), "/docs", new Set());
  assert.match(result, /<h2 id="weiter">Weiter<\/h2>/);
  assert.match(result, /<p>Inhalt<\/p>/);
});
