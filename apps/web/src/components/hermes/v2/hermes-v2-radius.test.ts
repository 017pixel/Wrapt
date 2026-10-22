// Die Hermes-V2-Fläche ist eckig: Composer-Karte, Senden-Knopf, Chips und
// Sprechblase tragen den Theme-Radius (--radius). Dieser Test hält die
// Radien fest, damit keine weichen Rundungen zurücksickern.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest ersetzt CSS-Importe durch leere Stubmodule; daher direkt lesen.
const read = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, name), "utf8");

const areaCss = read("hermes-v2-input.css");
const composerCss = read("hermes-v2-composer.css");
const surfaceCss = read("hermes-v2.css");
const messagesCss = read("hermes-v2-messages.css");

const FLATEN = [areaCss, composerCss, surfaceCss, messagesCss];

/** Der Inhalt einer Regel, ohne Selektor und Nachbarregeln. */
function block(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `Regel "${selector}" fehlt`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("Hermes-V2-Radien", () => {
  it("die Composer-Karte ist eckig", () => {
    const card = block(areaCss, ".hermesv2-composer-area {");
    expect(card).toContain("border-radius: var(--radius);");
    // Die Haarlinie und der Trenner zur Leiste bleiben.
    expect(card).toContain("border: 1px solid var(--color-line);");
    expect(block(areaCss, ".hermesv2-composer-bar {")).toContain(
      "border-top: 1px solid var(--color-line);",
    );
  });

  it("der Senden-Knopf ist eckig, gefüllt und 44 Pixel gross", () => {
    const send = block(areaCss, ".hermesv2-composer-area .hermesv2-send {");
    expect(send).toContain("border-radius: var(--radius);");
    expect(send).toContain("background: var(--color-accent);");
    expect(send).toContain("width: 44px;");
    expect(send).toContain("height: 44px;");
  });

  it("die Bedienelemente der Leiste sind eckig", () => {
    expect(block(areaCss, ".hermesv2-composer-area .hermesv2-stop {")).toContain(
      "border-radius: var(--radius);",
    );
    expect(
      block(composerCss, ".hermesv2-composer-area .hermesv2-chip {"),
    ).toContain("border-radius: var(--radius);");
    expect(
      block(composerCss, ".hermesv2-composer-area .hermesv2-composer-bar :is(button) {"),
    ).toContain("border-radius: var(--radius);");
  });

  it("die Sprechblase der eigenen Nachricht ist eckig", () => {
    expect(
      block(messagesCss, ".hermesv2-row.is-user .hermesv2-row-text {"),
    ).toContain("border-radius: var(--radius);");
  });

  it("die Fläche kennt keine eigenen Radien-Tokens mehr", () => {
    expect(surfaceCss).not.toContain("--hermesv2-radius");
    for (const css of FLATEN) {
      expect(css).not.toContain("var(--hermesv2-radius");
    }
  });

  it("keine runden Ecken und keine festen Pixelradien", () => {
    for (const css of FLATEN) {
      expect(css).not.toMatch(/border-radius:\s*(50%|999px|\d+px)/);
    }
  });
});
