import { NoteIcon } from "../../icons";
import { openQuickNote } from "./quickNoteState";

export function QuickNoteButton() {
  return <button type="button" className="quick-note-trigger" aria-label="Quick Note öffnen" title="Quick Note öffnen" onClick={openQuickNote}><NoteIcon aria-hidden /></button>;
}
