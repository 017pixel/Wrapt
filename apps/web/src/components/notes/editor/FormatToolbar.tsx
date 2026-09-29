import { useRef, useState } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { useDismissible } from "../hooks/useDismissible.js";

export interface TextColor {
  name: string;
  value: string | null;
  label: string;
}

/** Textfarben-Palette; null setzt die Farbe zurück. */
export const textColors: TextColor[] = [
  { name: "default", value: null, label: "Standard" },
  { name: "gray", value: "#9aa0a6", label: "Grau" },
  { name: "brown", value: "#c58b6a", label: "Braun" },
  { name: "orange", value: "#e8a24d", label: "Orange" },
  { name: "yellow", value: "#e3c14b", label: "Gelb" },
  { name: "green", value: "#74c168", label: "Grün" },
  { name: "blue", value: "#6aa8ef", label: "Blau" },
  { name: "purple", value: "#b48ae8", label: "Lila" },
  { name: "pink", value: "#e07ab0", label: "Pink" },
  { name: "red", value: "#e5736f", label: "Rot" },
];

const highlightColors = [
  { value: null, label: "ohne" },
  { value: "#e3c14b55", label: "Gelb" },
  { value: "#74c16855", label: "Grün" },
  { value: "#6aa8ef55", label: "Blau" },
  { value: "#e07ab055", label: "Pink" },
];

interface FormatToolbarProps {
  editor: Editor;
  onRequestLink: () => void;
}

/** Schwebende Formatierungsleiste bei Textauswahl. */
export function FormatToolbar({ editor, onRequestLink }: FormatToolbarProps) {
  const [colorsOpen, setColorsOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const colorsRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useDismissible({ open: colorsOpen, onClose: () => setColorsOpen(false), rootRef: colorsRef });
  useDismissible({
    open: highlightOpen,
    onClose: () => setHighlightOpen(false),
    rootRef: highlightRef,
  });

  const activeColor = (editor.getAttributes("textStyle").color as string | undefined) ?? null;

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: current }) =>
        current.isEditable &&
        !current.state.selection.empty &&
        !current.isActive("codeBlock") &&
        !current.isActive("image")
      }
    >
      <div className="note-format-toolbar" role="toolbar" aria-label="Formatierung">
        <button
          type="button"
          className={editor.isActive("bold") ? "is-active" : ""}
          aria-label="Fett"
          aria-pressed={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "is-active" : ""}
          aria-label="Kursiv"
          aria-pressed={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={editor.isActive("underline") ? "is-active" : ""}
          aria-label="Unterstrichen"
          aria-pressed={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="note-format-underline">U</span>
        </button>
        <button
          type="button"
          className={editor.isActive("strike") ? "is-active" : ""}
          aria-label="Durchgestrichen"
          aria-pressed={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <span className="note-format-strike">S</span>
        </button>
        <button
          type="button"
          className={editor.isActive("code") ? "is-active" : ""}
          aria-label="Inline-Code"
          aria-pressed={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <span className="note-format-mono">{"</>"}</span>
        </button>
        <span className="note-format-separator" aria-hidden />
        <button
          type="button"
          className={editor.isActive("link") ? "is-active" : ""}
          aria-label="Link"
          aria-pressed={editor.isActive("link")}
          onClick={onRequestLink}
        >
          Link
        </button>
        <div className="note-format-popover-wrap" ref={colorsRef}>
          <button
            type="button"
            aria-label="Textfarbe"
            aria-expanded={colorsOpen}
            className={activeColor !== null ? "is-active" : ""}
            data-dismiss-ignore
            onClick={() => {
              setHighlightOpen(false);
              setColorsOpen((value) => !value);
            }}
          >
            <span className="note-color-indicator" style={activeColor === null ? undefined : { color: activeColor }}>
              A
            </span>
          </button>
          {colorsOpen ? (
            <div className="note-format-popover" role="menu" aria-label="Textfarbe">
              {textColors.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  role="menuitem"
                  aria-label={color.label}
                  title={color.label}
                  className="note-color-swatch"
                  data-color={color.name}
                  onClick={() => {
                    if (color.value === null) editor.chain().focus().unsetColor().run();
                    else editor.chain().focus().setColor(color.value).run();
                    setColorsOpen(false);
                  }}
                >
                  A
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="note-format-popover-wrap" ref={highlightRef}>
          <button
            type="button"
            aria-label="Hintergrundfarbe"
            aria-expanded={highlightOpen}
            className={editor.isActive("highlight") ? "is-active" : ""}
            data-dismiss-ignore
            onClick={() => {
              setColorsOpen(false);
              setHighlightOpen((value) => !value);
            }}
          >
            <span className="note-highlight-indicator">H</span>
          </button>
          {highlightOpen ? (
            <div className="note-format-popover" role="menu" aria-label="Hintergrundfarbe">
              {highlightColors.map((color) => (
                <button
                  key={color.label}
                  type="button"
                  role="menuitem"
                  aria-label={color.label}
                  title={color.label}
                  className="note-highlight-swatch"
                  data-color={color.label}
                  style={color.value === null ? undefined : { background: color.value }}
                  onClick={() => {
                    if (color.value === null) editor.chain().focus().unsetHighlight().run();
                    else editor.chain().focus().setHighlight({ color: color.value }).run();
                    setHighlightOpen(false);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </BubbleMenu>
  );
}
