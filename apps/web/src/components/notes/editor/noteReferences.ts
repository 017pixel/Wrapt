import type { Note } from "@wrapt/contracts";
import type { Editor } from "@tiptap/core";
import { apiClient } from "../../../lib/apiClient";

export function insertNoteReferenceInEditor(
  editor: Editor,
  target: Pick<Note, "id" | "title">,
  inline = false,
): boolean {
  const mention = { type: "noteMention", attrs: { noteId: target.id, label: target.title } };
  if (inline) return editor.chain().focus().insertContent(mention).run();
  const last = editor.state.doc.lastChild;
  const end = editor.state.doc.content.size;
  if (last?.type.name === "paragraph" && last.content.size === 0) {
    return editor.chain().focus().insertContentAt(end - 1, mention).run();
  }
  return editor.chain().focus().insertContentAt(end, {
    type: "paragraph",
    content: [mention],
  }).run();
}

function noteReferenceMarkdown(note: Pick<Note, "id" | "title">): string {
  return `[noteMention noteId=${JSON.stringify(note.id)} label=${JSON.stringify(note.title)}]`;
}

function appendReference(content: string, note: Pick<Note, "id" | "title">): string {
  const marker = `[noteMention noteId=${JSON.stringify(note.id)}`;
  if (content.includes(marker)) return content;
  const separator = content === "" ? "" : content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}${noteReferenceMarkdown(note)}`;
}

/** Fügt einen Link an das Ende einer anderen Seite an, ohne parallele Änderungen zu überschreiben. */
export async function appendNoteReferenceToPage(
  parentId: string,
  target: Pick<Note, "id" | "title">,
): Promise<boolean> {
  let current = await apiClient.note(parentId);
  if (!current?.note || current.note.archived) return false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const content = appendReference(current.note.content, target);
    if (content === current.note.content) return true;
    const result = await apiClient.saveNoteContent(parentId, {
      content,
      expectedRevision: current.note.revision,
    });
    if (!result) return false;
    if (result.status === "saved") return true;
    current = { note: result.note };
  }
  return false;
}
