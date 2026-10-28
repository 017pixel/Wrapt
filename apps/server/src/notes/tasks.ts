import type { Note, NoteTask } from "@wrapt/contracts";
const taskPattern = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*)$/;

/** Zeilenposition plus Revision identifizieren die Originalaufgabe ohne zweite Datenkopie. */
export function noteTasks(note: Note, projectId: string | null): NoteTask[] {
  let fence: string | null = null;
  const tasks: NoteTask[] = [];
  note.content.split("\n").forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return;
    }
    if (fence) return;
    const match = taskPattern.exec(line);
    if (!match) return;
    const due = /\s*\[due:: (\d{4}-\d{2}-\d{2})\]\s*$/.exec(match[4] ?? "");
    tasks.push({ noteId: note.id, noteTitle: note.title, line: index, text: (match[4] ?? "").replace(/\s*\[due:: [^\]]+\]\s*$/, ""),
      checked: match[2]?.toLowerCase() === "x", revision: note.revision, projectId, due: due?.[1] ?? null });
  });
  return tasks;
}
export function updateTaskLine(content: string, line: number, checked: boolean, due?: string | null): string {
  const lines = content.split("\n");
  lines[line] = lines[line]!.replace(taskPattern, (_all, before: string, _state: string, after: string, text: string) => {
    const next = due === undefined ? text : text.replace(/\s*\[due:: [^\]]+\]\s*$/, "") + (due ? ` [due:: ${due}]` : "");
    return before + (checked ? "x" : " ") + after + next;
  });
  return lines.join("\n");
}
