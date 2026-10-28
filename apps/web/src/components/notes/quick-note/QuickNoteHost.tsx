import { lazy, Suspense, useEffect, useState } from "react";
import { QUICK_NOTE_EVENT, useQuickNote } from "./quickNoteState";
import "./quick-note.css";

const QuickNoteWindow = lazy(() => import("./QuickNoteWindow"));

/** Der Host bleibt beim Routenwechsel erhalten und lädt den Editor erst bei Bedarf. */
export function QuickNoteHost() {
  const [used, setUsed] = useState(false);
  const open = useQuickNote((state) => state.open);
  useEffect(() => {
    const show = (event: Event) => {
      event.preventDefault();
      setUsed(true);
      useQuickNote.getState().show();
    };
    window.addEventListener(QUICK_NOTE_EVENT, show);
    return () => window.removeEventListener(QUICK_NOTE_EVENT, show);
  }, []);
  return used || open ? <Suspense fallback={<div className="quick-note-loading" role="status">Notizfenster wird geladen…</div>}><QuickNoteWindow /></Suspense> : null;
}
