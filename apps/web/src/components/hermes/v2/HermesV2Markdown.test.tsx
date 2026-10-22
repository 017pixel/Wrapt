// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { marked } from "marked";
import { MarkdownView, renderMarkdown } from "./HermesV2Markdown";
import { HermesV2Reasoning } from "./HermesV2Reasoning";
import { HermesV2ToolCard } from "./HermesV2ToolCard";
import type { ChatToolView } from "./chat-types";

describe("Markdown-Sicherheit", () => {
  afterEach(cleanup);

  it("erlaubt Betonung, Links und Code, entfernt aber aktive Inhalte", () => {
    const html = renderMarkdown(
      '**Fett**\n\n[Beispiel](https://example.org/)\n\n<img src=x onerror="alert(1)"><script>alert(1)</script>\n\n[Unsicher](javascript:alert(1))\n\n```js\nconst eigenerCode = 1;\n```',
    );
    expect(html).toContain("<strong>Fett</strong>");
    expect(html).toContain('href="https://example.org/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("const eigenerCode = 1;");
  });

  it("behandelt relative Links und unbekannte Schemata vorsichtig", () => {
    const html = renderMarkdown(
      "[Intern](/anderer-pfad) und [Datei](file:///etc/passwd) und [Extern](//example.org/x)",
    );
    expect(html).toContain('href="/anderer-pfad"');
    expect(html).not.toContain('href="file:');
    const external = html.match(
      /<a href="\/\/example.org\/x"[^>]*>Externe?<\/a>/,
    );
    expect(external?.[0]).toContain('rel="noopener noreferrer"');
  });

  it("läuft keine Image-Daten-URLs zu und lässt Bilder nur über https", () => {
    const html = renderMarkdown(
      "![Bild](data:image/svg+xml;base64,AAAA) ![Bild2](https://example.org/bild.png) ![Unsicher](http://example.org/bild.png)",
    );
    expect(html).not.toContain("data:image");
    expect(html).not.toContain('src="http:');
    expect(html).toContain('src="https://example.org/bild.png"');
  });

  it("rendert gesäubertes Markdown ohne aktive Inhalte in der Fläche", () => {
    const { container } = render(
      <MarkdownView
        text={
          "[Beispiel](https://example.org/)\n\n<script>alert(1)</script>\n\n[Unsicher](javascript:alert(1))"
        }
      />,
    );
    const link = screen.getByRole("link", { name: "Beispiel" });
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(
      container.querySelector("script, a[href^='javascript:']"),
    ).toBeNull();
  });

  it("hebt Codeblöcke hervor und hält Terminalausgaben als reinen Text", () => {
    const { container } = render(
      <MarkdownView text={"```js\nconst eigenerCode = 1;\n```"} />,
    );
    const code = container.querySelector("pre code") as HTMLElement;
    expect(code.className).toContain("js");
    expect(code.dataset).toBeDefined();
  });

  it("hebt nur unterstützte Sprachen hervor, nicht alles automatisch", () => {
    const { container } = render(
      <MarkdownView text={"```rust\nfn main() {}\n```\n\n```py\na = 1\n```"} />,
    );
    const blocks = Array.from(
      container.querySelectorAll("pre code"),
    ) as HTMLElement[];
    const rust = blocks.find((block) =>
      block.className.includes("language-rust"),
    ) as HTMLElement;
    const py = blocks.find((block) =>
      block.className.includes("language-py"),
    ) as HTMLElement;
    expect(rust.dataset.highlighted).toBeUndefined();
    expect(py.dataset.highlighted).toBe("yes");
  });

  it("parst unveränderten Text bei erneutem Rendern nicht neu", () => {
    const spy = vi.spyOn(marked, "parse");
    try {
      const { rerender } = render(<MarkdownView text={"Antwort **fett**"} />);
      expect(spy).toHaveBeenCalledTimes(1);
      rerender(<MarkdownView text={"Antwort **fett**"} />);
      expect(spy).toHaveBeenCalledTimes(1);
      rerender(<MarkdownView text={"Antwort **fetter**"} />);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
});

function tool(overrides: Partial<ChatToolView>): ChatToolView {
  return {
    id: "werkzeug-1",
    toolId: "call-1",
    turnId: "t1",
    name: "browser_tool",
    status: "running",
    outcome: "unknown",
    input: '{"text":"eigener Input"}',
    output: null,
    durationMs: null,
    ...overrides,
  };
}

describe("Werkzeug- und Reasoning-Karten", () => {
  afterEach(cleanup);

  it("zeigt laufende Werkzeuge kompakt und offenbart Details auf Nutzeraktion", () => {
    const { container } = render(<HermesV2ToolCard tool={tool({})} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.textContent).toContain("läuft");
    expect(details.hasAttribute("open")).toBe(false);
    fireEvent.click(details.querySelector("summary") as HTMLElement);
    expect(details.hasAttribute("open")).toBe(true);
    expect(details.textContent).toContain("eigener Input");
  });

  it("unterscheidet beendet von erfolgreich und benennt Unbekanntes offen", () => {
    const { container } = render(
      <HermesV2ToolCard
        tool={tool({
          status: "complete",
          outcome: "unknown",
          output: "Irgendeine Ausgabe",
        })}
      />,
    );
    fireEvent.click(container.querySelector("summary") as HTMLElement);
    expect(container.textContent).toContain("beendet");
    expect(container.textContent).not.toContain("fertig");
    expect(container.textContent).toContain("kein Beleg");
  });

  it("kennzeichnet Fehlschlag deutlich", () => {
    const { container } = render(
      <HermesV2ToolCard
        tool={tool({ status: "complete", outcome: "error" })}
      />,
    );
    expect(container.querySelector("[data-outcome='error']")).not.toBeNull();
  });

  it("zeigt Reasoning nur auf Ausklappen und streaming als Denken", () => {
    const { container } = render(
      <HermesV2Reasoning
        text="Vom Modell ausdrücklich gelieferter sichtbarer Inhalt"
        streaming
      />,
    );
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(container.textContent).toContain("Denkt nach…");
    expect(details.hasAttribute("open")).toBe(false);
    fireEvent.click(container.querySelector("summary") as HTMLElement);
    expect(details.hasAttribute("open")).toBe(true);
    expect(details.textContent).toContain(
      "Vom Modell ausdrücklich gelieferter sichtbarer Inhalt",
    );
  });
});
