import { marked } from "marked";
import DOMPurify from "dompurify";
import { CheckIcon, CopyIcon } from "../../icons";

/**
 * Markdown-Pipeline für Hermes-Antworten. Erst parsen, dann streng reinigen:
 * keine Eventhandler, keine Frames, keine Skripte, keine javascript-URLs,
 * keine data:URIs. Externe Links (auch protokollrelativ) erhalten
 * noopener noreferrer und öffnen in neuem Tab.
 */
const ALLOWED_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];
const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "class",
  "target",
  "rel",
  "start",
  "colspan",
  "rowspan",
];

const purify = DOMPurify();
purify.addHook("afterSanitizeAttributes", (node) => {
  if (!(node instanceof Element)) return;
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? "";
    if (/^(https?:)?\/\//i.test(href) || /^https?:/i.test(href)) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    } else if (!/^(#|\/)/.test(href)) {
      node.removeAttribute("href");
    }
  }
  if (
    node.tagName === "IMG" &&
    !/^https:/i.test(node.getAttribute("src") ?? "")
  ) {
    node.removeAttribute("src");
  }
});

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) =>
    character === "&"
      ? "&amp;"
      : character === "<"
        ? "&lt;"
        : character === ">"
          ? "&gt;"
          : character === '"'
            ? "&quot;"
            : "&#39;",
  );
}

/** Terminal- und Tool-Flächen bleiben reiner Text, niemals Markdown. */
export function renderPlainText(text: string): string {
  return escapeHtml(text);
}

export function renderMarkdown(text: string): string {
  const parsed = marked.parse(text, { async: false }) as string;
  return purify.sanitize(parsed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: [
      "script",
      "iframe",
      "style",
      "form",
      "input",
      "button",
      "object",
      "embed",
      "video",
      "audio",
      "svg",
      "math",
      "base",
      "meta",
      "link",
    ],
    FORBID_ATTR: [
      "onerror",
      "onload",
      "onclick",
      "onmouseover",
      "style",
      "srcset",
      "formaction",
      "xlink:href",
      "action",
      "background",
      "dynsrc",
      "lowsrc",
    ],
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  });
}

import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const languages: Array<[string, unknown]> = [
  ["javascript", javascript],
  ["typescript", typescript],
  ["json", json],
  ["css", css],
  ["xml", xml],
  ["bash", bash],
  ["python", python],
];
for (const [name, definition] of languages)
  hljs.registerLanguage(name, definition as never);

/** Aktive Rückmeldung nur kurze Zeit, danach wieder Ruhe. */
export function useCopyFeedback(durationMs = 1600): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const mark = () => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), durationMs);
  };
  return [copied, mark];
}

/** Wie oft der Text einer laufenden Antwort neu geparst wird. */
const STREAM_PARSE_MS = 120;

/**
 * Waehrend des Streams zeigt der Text hoechstens alle STREAM_PARSE_MS den
 * neuesten Stand. Das Parsen und Reinigen des Markdown ist der teuerste
 * Posten pro Token; ohne Bremse wächst die Antwort quadratisch. Fertige
 * Antworten werden sofort und vollstaendig uebernommen.
 */
function useThrottledText(text: string, active: boolean): string {
  const [shown, setShown] = useState(text);
  const latest = useRef(text);
  const timer = useRef<number | null>(null);
  const lastFlush = useRef(0);

  useEffect(() => {
    latest.current = text;
    if (!active) {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      lastFlush.current = 0;
      return;
    }
    const wait = STREAM_PARSE_MS - (Date.now() - lastFlush.current);
    if (wait <= 0) {
      lastFlush.current = Date.now();
      setShown(text);
      return;
    }
    // Der laufende Timer wird nicht bei jedem Token neu gestartet: das ist
    // eine Bremse, kein Nachlauf.
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      lastFlush.current = Date.now();
      setShown(latest.current);
    }, wait);
  }, [text, active]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return active ? shown : text;
}

export function CopyButton({
  text,
  label = "Kopieren",
}: {
  text: string;
  label?: string;
}) {
  const [copied, mark] = useCopyFeedback();
  return (
    <button
      type="button"
      className="icon-button hermesv2-copy"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(mark, () => undefined);
      }}
      aria-label={label}
      title={copied ? "Kopiert" : label}
    >
      {copied ? <CheckIcon aria-hidden style={{ color: "currentColor" }} /> : <CopyIcon aria-hidden style={{ color: "currentColor" }} />}
      <span className="sr-only" role="status">{copied ? "Kopiert" : ""}</span>
    </button>
  );
}

/** Gesäubertes Markdown; Codeblöcke werden nach dem Einsetzen hervorgehoben
    und bekommen Copy nur über Nutzeraktion. */
export function MarkdownView({
  text,
  streaming = false,
  onGrow,
}: {
  text: string;
  streaming?: boolean;
  /**
   * Meldet, dass der dargestellte Text nach der Bremse gewachsen ist. Die
   * Nachrichtenliste nutzt das, um am Ende des Verlaufs mitzuscrollen.
   */
  onGrow?: (() => void) | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shown = useThrottledText(text, streaming);
  const html = useMemo(() => renderMarkdown(shown), [shown]);
  // Das Wachstum kommt nach der Bremse und damit ausserhalb der
  // Nachrichtenliste. Ohne diese Meldung bliebe der Verlauf stehen.
  const growRef = useRef(onGrow);
  growRef.current = onGrow;
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => {
    if (shown !== textRef.current) return;
    growRef.current?.();
  }, [shown]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    // Nur Code blockweise in einer unterstützten Sprache hevorheben; keine
    // unbegrenzte Autoerkennung über den ganzen Text.
    for (const block of Array.from(container.querySelectorAll("pre code"))) {
      const language =
        /(?:^|\s)language-([\w-]+)/.exec(
          (block as HTMLElement).className,
        )?.[1] ?? null;
      if (language && hljs.getLanguage(language))
        hljs.highlightElement(block as HTMLElement);
    }
    for (const pre of Array.from(container.querySelectorAll("pre"))) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "hermesv2-code-copy";
      copy.setAttribute("aria-label", "Code kopieren");
      copy.textContent = "Code kopieren";
      copy.addEventListener("click", (event) => {
        event.preventDefault();
        const code = (event.currentTarget as HTMLElement)
          .closest("pre")
          ?.querySelector("code");
        navigator.clipboard?.writeText(code?.textContent ?? "").then(
          () => {
            copy.textContent = "Kopiert";
          },
          () => {
            copy.textContent = "Kopieren nicht möglich";
          },
        );
      });
      pre.prepend(copy);
    }
    return () => {
      for (const copy of Array.from(
        container.querySelectorAll(".hermesv2-code-copy"),
      ))
        copy.remove();
    };
  }, [html]);
  return (
    <div
      ref={containerRef}
      className="hermesv2-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function TextBlock({
  text,
  className,
}: {
  text: string;
  className?: string;
}): ReactNode {
  return (
    <pre className={`hermesv2-plain ${className ?? ""}`}>
      <code>{text}</code>
    </pre>
  );
}
