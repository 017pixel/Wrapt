import { useCallback, useEffect, useRef, useState } from "react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CopyIcon, TrashIcon } from "../../icons";
import { useDismissible } from "../hooks/useDismissible.js";

interface BlockMenuProps {
  editor: Editor;
}

interface TargetBlock {
  node: ProseMirrorNode;
  pos: number;
  rect: DOMRect;
}

const turnIntoOptions = [
  { id: "paragraph", label: "Text", attrs: {} },
  { id: "heading", label: "Überschrift 1", attrs: { level: 1 } },
  { id: "heading", label: "Überschrift 2", attrs: { level: 2 } },
  { id: "heading", label: "Überschrift 3", attrs: { level: 3 } },
  { id: "bulletList", label: "Aufzählung", attrs: {} },
  { id: "orderedList", label: "Nummerierte Liste", attrs: {} },
  { id: "taskList", label: "Aufgabe", attrs: {} },
  { id: "blockquote", label: "Zitat", attrs: {} },
  { id: "codeBlock", label: "Codeblock", attrs: { language: "plaintext" } },
  { id: "callout", label: "Callout", attrs: { variant: "info", title: null } },
];

const dragIndicatorPath =
  "M349.91-160q-28.91 0-49.41-20.59-20.5-20.59-20.5-49.5t20.59-49.41q20.59-20.5 49.5-20.5t49.41 20.59q20.5 20.59 20.5 49.5t-20.59 49.41q-20.59 20.5-49.5 20.5Zm260 0q-28.91 0-49.41-20.59-20.5-20.59-20.5-49.5t20.59-49.41q20.59-20.5 49.5-20.5t49.41 20.59q20.5 20.59 20.5 49.5t-20.59 49.41q-20.59 20.5-49.5 20.5Zm-260-250q-28.91 0-49.41-20.59-20.5-20.59-20.5-49.5t20.59-49.41q20.59-20.5 49.5-20.5t49.41 20.59q20.5 20.59 20.5 49.5t-20.59 49.41q-20.59 20.5-49.5 20.5Zm260 0q-28.91 0-49.41-20.59-20.5-20.59-20.5-49.5t20.59-49.41q20.59-20.5 49.5-20.5t49.41 20.59q20.5 20.59 20.5 49.5t-20.59 49.41q-20.59 20.5-49.5 20.5Zm-260-250q-28.91 0-49.41-20.59-20.5-20.59-20.5-49.5t20.59-49.41q20.59-20.5 49.5-20.5t49.41 20.59q20.5 20.59 20.5 49.5t-20.59 49.41q-20.59 20.5-49.5 20.5Zm260 0q-28.91 0-49.41-20.59-20.5-20.59-20.5-49.5t20.59-49.41q20.59-20.5 49.5-20.5t49.41 20.59q20.5 20.59 20.5 49.5t-20.59 49.41q-20.59 20.5-49.5 20.5Z";

function DragIndicatorIcon() {
  return (
    <svg viewBox="0 -960 960 960" aria-hidden focusable="false">
      <path d={dragIndicatorPath} fill="currentColor" />
    </svg>
  );
}

/**
 * Block-Griff links am Absatz (ziehen zum Verschieben) und Block-Menü für
 * Umwandeln, Duplizieren und Löschen. Das Menü friert den Block beim Öffnen
 * ein und folgt dem Mauszeiger nicht mehr.
 */
export function BlockMenu({ editor }: BlockMenuProps) {
  const [target, setTarget] = useState<TargetBlock | null>(null);
  const [frozen, setFrozen] = useState<TargetBlock | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOpen = frozen !== null;

  useDismissible({ open: menuOpen, onClose: () => setFrozen(null), rootRef: menuRef });

  // Beim Scrollen schließen, damit das Menü nicht an einer alten Position klebt.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setFrozen(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen]);

  const replaceBlock = useCallback(
    (type: string, attrs: Record<string, unknown>) => {
      if (!frozen) return;
      const text = frozen.node.textContent;
      const textContent: JSONContent[] = text === "" ? [] : [{ type: "text", text }];
      let next: JSONContent;
      if (type === "bulletList" || type === "orderedList" || type === "taskList") {
        next = {
          type,
          content: [{ type: "listItem", content: [{ type: "paragraph", content: textContent }] }],
        };
      } else if (type === "callout") {
        next = { type, attrs, content: [{ type: "paragraph", content: textContent }] };
      } else if (type === "heading") {
        next = { type, attrs, content: textContent };
      } else {
        next = { type, attrs, ...(textContent.length === 0 ? {} : { content: textContent }) };
      }
      editor
        .chain()
        .focus()
        .insertContentAt({ from: frozen.pos, to: frozen.pos + frozen.node.nodeSize }, next)
        .run();
      setFrozen(null);
    },
    [editor, frozen],
  );

  const duplicate = useCallback(() => {
    if (!frozen) return;
    editor
      .chain()
      .insertContentAt(frozen.pos + frozen.node.nodeSize, frozen.node.toJSON())
      .run();
    setFrozen(null);
  }, [editor, frozen]);

  const remove = useCallback(() => {
    if (!frozen) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: frozen.pos, to: frozen.pos + frozen.node.nodeSize })
      .run();
    setFrozen(null);
  }, [editor, frozen]);

  const menuStyle = frozen
    ? {
        top: Math.min(frozen.rect.bottom + 6, Math.max(8, window.innerHeight - 380)),
        left: Math.max(8, Math.min(frozen.rect.left - 12, window.innerWidth - 260)),
      }
    : undefined;

  return (
    <>
      <DragHandle
        editor={editor}
        className="note-block-handle-slot"
        onNodeChange={({ node, pos }) => {
          if (menuOpen) return;
          if (!node) {
            setTarget(null);
            return;
          }
          const dom = editor.view.domAtPos(pos + 1);
          const element =
            dom.node.nodeType === Node.ELEMENT_NODE
              ? (dom.node as HTMLElement)
              : (dom.node.parentElement ?? null);
          const rect = element?.getBoundingClientRect();
          if (!rect) return;
          setTarget({ node, pos, rect });
        }}
      >
        <button
          type="button"
          className="note-block-handle"
          aria-label="Block-Menü öffnen"
          title="Block-Menü"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setFrozen(target)}
        >
          <DragIndicatorIcon />
        </button>
      </DragHandle>
      {frozen !== null ? (
        <div
          ref={menuRef}
          className="note-block-menu"
          role="dialog"
          aria-label="Block-Menü"
          style={menuStyle}
          onMouseDown={(event) => event.preventDefault()}
        >
          <p className="note-block-menu-head">Umwandeln in</p>
          <div className="note-block-menu-turns">
            {turnIntoOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => replaceBlock(option.id, option.attrs)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="note-block-menu-actions">
            <button type="button" onClick={duplicate}>
              <CopyIcon aria-hidden /> Duplizieren
            </button>
            <button type="button" className="is-danger" onClick={remove}>
              <TrashIcon aria-hidden /> Löschen
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
