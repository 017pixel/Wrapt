import type { Note } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";

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
