import { z } from "zod";
import { NOTE_CONTENT_MAX_CHARACTERS } from "@wrapt/contracts";

const draftSchema = z.object({ version: z.literal(1), revision: z.number().int().positive(), content: z.string().max(NOTE_CONTENT_MAX_CHARACTERS), updatedAt: z.number() });
const titleDraftSchema = z.object({ version: z.literal(1), originalTitle: z.string(), value: z.string().max(300) });
export type StoredNoteDraft = z.infer<typeof draftSchema>;
let writers: string[] | undefined;
function writerIds() {
  if (!writers) {
    // Duplizierte Tabs erben sessionStorage. Jeder Seitenlauf erhält deshalb
    // eine neue Schreib-ID; geerbte IDs werden ausschließlich zur Wiederherstellung gelesen.
    const legacy = sessionStorage.getItem("wrapt.notes-writer.v1");
    let stored: unknown = [];
    try { stored = JSON.parse(sessionStorage.getItem("wrapt.notes-writers.v2") ?? "[]"); } catch { /* Defekte Ansichtseinstellungen verwerfen. */ }
    const previous = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    writers = [crypto.randomUUID(), ...new Set([...previous, ...(legacy ? [legacy] : [])])];
    sessionStorage.setItem("wrapt.notes-writers.v2", JSON.stringify(writers));
    sessionStorage.setItem("wrapt.notes-writer.v1", writers[0]!);
  }
  return writers;
}
function key(writer: string, noteId: string, title: boolean) {
  return `wrapt.note-draft.v1:${writer}:${noteId}${title ? ":title" : ""}`;
}
function readStored(noteId: string, title: boolean): unknown {
  for (const writer of writerIds()) {
    const raw = localStorage.getItem(key(writer, noteId, title));
    if (!raw) continue;
    const value: unknown = JSON.parse(raw);
    // Die Löschmarke gilt nur in dieser Tab-Abstammung und löscht nie einen
    // noch offenen Entwurf eines anderen (auch duplizierten) Tabs.
    if (value && typeof value === "object" && "cleared" in value) return null;
    return value;
  }
  return null;
}
function writeStored(noteId: string, title: boolean, value: unknown): boolean {
  try { localStorage.setItem(key(writerIds()[0]!, noteId, title), JSON.stringify(value)); return true; }
  catch { return false; }
}
export function readNoteDraft(noteId: string): StoredNoteDraft | null {
  try { const result = draftSchema.safeParse(readStored(noteId, false)); return result.success ? result.data : null; }
  catch { return null; }
}
export function writeNoteDraft(noteId: string, revision: number, content: string): boolean {
  return writeStored(noteId, false, { version: 1, revision, content, updatedAt: Date.now() } satisfies StoredNoteDraft);
}
export function removeNoteDraft(noteId: string) { writeStored(noteId, false, { cleared: true }); }
export function readNoteTitleDraft(noteId: string) {
  try { const result = titleDraftSchema.safeParse(readStored(noteId, true)); return result.success ? result.data : null; }
  catch { return null; }
}
export function writeNoteTitleDraft(noteId: string, originalTitle: string, value: string): boolean {
  return writeStored(noteId, true, { version: 1, originalTitle, value });
}
export function removeNoteTitleDraft(noteId: string) { writeStored(noteId, true, { cleared: true }); }
