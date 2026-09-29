import { useId, useState, type KeyboardEvent } from "react";
import { CodeFileIcon, CopyIcon } from "../icons";
import { writeClipboardText } from "../../lib/clipboard";

interface OrbitSnippetEditorProps {
  title: string;
  language: string;
  content: string;
  onLanguageChange: (language: string) => void;
  onContentChange: (content: string) => void;
}

const languageHints = ["text", "typescript", "javascript", "python", "json", "html", "css", "bash", "sql", "markdown"];

export function OrbitSnippetEditor({ title, language, content, onLanguageChange, onContentChange }: OrbitSnippetEditorProps) {
  const instanceId = useId();
  const [status, setStatus] = useState<string | null>(null);
  const lineCount = content.length === 0 ? 0 : content.split("\n").length;

  const copy = async () => {
    try {
      await writeClipboardText(content);
      setStatus("Code kopiert");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Code konnte nicht kopiert werden.");
    }
  };

  const indent = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) return;
    event.preventDefault();
    const editor = event.currentTarget;
    const start = editor.selectionStart;
    const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
    if (event.shiftKey) {
      const leadingSpaces = editor.value.slice(lineStart, start).match(/^ {1,2}/)?.[0];
      if (!leadingSpaces) return;
      editor.setRangeText("", lineStart, lineStart + leadingSpaces.length, "start");
    } else {
      editor.setRangeText("  ", start, start, "end");
    }
    onContentChange(editor.value);
  };

  return (
    <div className="orbit-snippet-editor">
      <div className="orbit-snippet-meta">
        <CodeFileIcon className="h-3.5 w-3.5" />
        <label className="sr-only" htmlFor={`${instanceId}-language`}>Programmiersprache</label>
        <input
          id={`${instanceId}-language`}
          aria-label="Programmiersprache"
          list={`${instanceId}-language-hints`}
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
        />
        <datalist id={`${instanceId}-language-hints`}>{languageHints.map((hint) => <option value={hint} key={hint} />)}</datalist>
        <span className="orbit-snippet-line-count">{lineCount} {lineCount === 1 ? "Zeile" : "Zeilen"}</span>
        <button type="button" className="orbit-snippet-copy" onClick={() => void copy()} aria-label="Code kopieren" title="Code kopieren">
          <CopyIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        aria-label={`${title} Code bearbeiten`}
        aria-describedby={status ? `${instanceId}-copy-status` : undefined}
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        onKeyDown={indent}
        spellCheck={false}
        placeholder="Code einfügen…"
        className="orbit-code-editor nodrag nowheel"
      />
      {status ? <span id={`${instanceId}-copy-status`} className="sr-only" role="status">{status}</span> : null}
    </div>
  );
}
