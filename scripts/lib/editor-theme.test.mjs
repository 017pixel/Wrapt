import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { themeFromCss } from "./editor-theme.mjs";

test("VS-Code-Theme folgt der zentralen Palette und liefert gültige Farbwerte", async () => {
  const css = await readFile(new URL("../../apps/web/src/index.css", import.meta.url), "utf8");
  const theme = themeFromCss(css);
  assert.equal(theme.colors["editor.background"], "#0a0a0a");
  assert.equal(theme.colors["sideBar.background"], "#111111");
  for (const color of Object.values(theme.colors)) assert.match(color, /^#[a-f0-9]{6}([a-f0-9]{2})?$/i);
  const changed = themeFromCss(css.replace("--color-ink-950: #0a0a0a", "--color-ink-950: #101010"));
  assert.equal(changed.colors["editor.background"], "#101010");
  assert.throws(() => themeFromCss(""), /Tokens fehlen/);
});
