import { useEffect, useMemo, useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { lowlight } from "./lowlight.js";

/** Codeblock mit Sprachwahl und Kopierknopf. */
export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const languages = useMemo(() => lowlight.listLanguages().sort(), []);
  const language = (node.attrs.language ?? "plaintext") as string;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(node.textContent).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <NodeViewWrapper className="note-code-block">
      <div className="note-code-head" contentEditable={false}>
        <select
          className="note-code-language"
          aria-label="Programmiersprache"
          value={language}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ language: event.target.value })}
        >
          {languages.includes(language) ? null : <option value={language}>{language}</option>}
          {languages.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button type="button" className="note-code-copy" onClick={copy}>
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
