import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { TableOfContentData } from "@tiptap/extension-table-of-contents";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

interface TocEntry {
  id: string;
  level: number;
  text: string;
}

function collectEntries(items: TableOfContentData): TocEntry[] {
  return items.map((item) => ({
    id: item.id,
    level: item.level,
    text: (item.dom?.textContent ?? "").trim(),
  }));
}

function scrollToAnchor(editor: NodeViewProps["editor"], id: string) {
  const element = editor.view.dom.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  editor.state.doc.descendants((node: ProseMirrorNode, position: number) => {
    if (node.type.name === "heading" && node.attrs.id === id) {
      const dom = editor.view.domAtPos(position + 1);
      const target = dom.node.nodeType === Node.ELEMENT_NODE
        ? (dom.node as HTMLElement)
        : (dom.node.parentElement ?? null);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      return false;
    }
    return true;
  });
}

/** Inhaltsverzeichnis als lebender Block; aktualisiert sich mit den Überschriften. */
export function TableOfContentsView({ editor }: NodeViewProps) {
  const [entries, setEntries] = useState<TocEntry[]>(() =>
    collectEntries(editor.storage.tableOfContents?.content ?? []),
  );

  useEffect(() => {
    const update = () =>
      setEntries(collectEntries(editor.storage.tableOfContents?.content ?? []));
    update();
    editor.on("update", update);
    editor.on("create", update);
    return () => {
      editor.off("update", update);
      editor.off("create", update);
    };
  }, [editor]);

  return (
    <NodeViewWrapper className="note-toc" contentEditable={false}>
      <p className="note-toc-title">Inhalt</p>
      {entries.length === 0 ? (
        <p className="note-toc-empty">Noch keine Überschriften.</p>
      ) : (
        <ul className="note-toc-list">
          {entries.map((entry) => (
            <li key={entry.id} data-level={entry.level}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => scrollToAnchor(editor, entry.id)}
              >
                {entry.text === "" ? "Ohne Titel" : entry.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </NodeViewWrapper>
  );
}
