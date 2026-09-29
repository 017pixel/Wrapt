interface NotesEmptyProps {
  windowMode: boolean;
  onCreate: () => void;
  onOpenSidebar?: () => void;
}

/** Leerer Zustand der Notizenfläche und Rückmeldung für ungültige Fensterlinks. */
export function NotesEmpty({ windowMode, onCreate, onOpenSidebar }: NotesEmptyProps) {
  return (
    <div className="notes-empty">
      <div>
        <strong>{windowMode ? "Seite nicht gefunden" : "Keine Seite geöffnet"}</strong>
        <span>
          {windowMode
            ? "Die Seite wurde gelöscht oder der Link ist ungültig."
            : "Wähle links eine Seite aus oder erstelle eine neue."}
        </span>
        {!windowMode ? <div className="notes-empty-actions">
          {onOpenSidebar ? <button type="button" className="quiet-button" onClick={onOpenSidebar}>Seiten öffnen</button> : null}
          <button type="button" className="notes-sidebar-new" onClick={onCreate}>Neue Seite</button>
        </div> : null}
      </div>
    </div>
  );
}
