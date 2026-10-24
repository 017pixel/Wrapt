// Vertrag für die Hermes-V2-Bewegung: Menüs wachsen aus ihrem Auslöser,
// Mikro-Feedback bleibt kurz, und reduzierte Bewegung schaltet alles ab.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, name), "utf8");

const layout = read("hermes-v2-layout.css");
const sidebar = read("hermes-v2-sidebar.css");
const dialogs = read("hermes-v2-dialogs.css");
const input = read("hermes-v2-input.css");
const core = read("hermes-v2.css");
const resources = read("hermes-v2-resource-layout.css");

describe("Hermes-V2-Bewegung", () => {
  it("nutzt gemeinsame Dauer- und Easing-Tokens", () => {
    expect(layout).toContain("var(--duration-slow) var(--ease-standard)");
    expect(layout).toContain("var(--duration-base) var(--ease-standard)");
    expect(sidebar).toContain(
      '.hermesv2-sidebar-menu-list[data-open="true"]',
    );
    expect(sidebar).toContain(
      "opacity var(--duration-base) var(--ease-standard),",
    );
    expect(input).toContain(
      "animation: hermesv2-send-in var(--duration-base) var(--ease-standard);",
    );
  });

  it("lässt Menüs aus ihrem Auslöser wachsen", () => {
    expect(layout).toContain("transform-origin: top right;");
    expect(sidebar).toContain("transform-origin: top left;");
    expect(dialogs).toContain(
      "animation: hermesv2-menu-in var(--duration-base) var(--ease-standard);",
    );
    expect(core).toContain("@keyframes hermesv2-menu-in");
    expect(core).toContain("opacity: 0;");
    expect(core).toContain("transform: translateY(-4px) scale(.98);");
  });

  it("schließt den mobilen Drawer schneller als er öffnet", () => {
    expect(layout).toContain(
      '.hermesv2 .hermesv2-sidebar[data-drawer-open="false"]',
    );
    expect(layout).toContain(
      '.hermesv2-drawer-backdrop[data-drawer-open="false"]',
    );
    expect(layout).toContain("transition-duration: var(--duration-fast);");
  });

  it("gibt jedem Bedienelement kurzes Press-Feedback", () => {
    expect(layout).toContain(".hermesv2-chip,");
    expect(layout).toContain(".hermesv2-shelf-collapse,");
    expect(layout).toContain(".hermesv2-headermenu-entry,");
    expect(layout).toContain("transform: scale(.97);");
  });

  it("schaltet Bewegung bei reduzierter Bewegung und Tastatur ab", () => {
    expect(layout).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.hermesv2 \.hermesv2-sidebar,[\s\S]*?transition: none;/,
    );
    expect(dialogs).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.hermesv2-projectpicker-menu \{\s*animation: none;/,
    );
    expect(resources).toContain(
      '.hermesv2[data-input-mode="keyboard"] * { animation: none !important; transition: none !important; }',
    );
  });
});
