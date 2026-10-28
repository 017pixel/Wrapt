import { useState } from "react";
export interface NoteUndoAction { label: string; run: () => Promise<void> }
export function NotesUndo({ action, onClose }: { action: NoteUndoAction; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <div className="notes-undo" role="status"><span>{error ? "Rückgängig konnte nicht ausgeführt werden." : action.label}</span>
    <button type="button" disabled={busy} onClick={() => {
      setBusy(true); setError(false);
      void action.run().then(onClose).catch(() => setError(true)).finally(() => setBusy(false));
    }}>Rückgängig</button><button type="button" aria-label="Rückgängig-Hinweis schließen" onClick={onClose}>×</button>
  </div>;
}
