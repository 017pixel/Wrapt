import { useState } from "react";
import { NoteIcon, PlusIcon } from "../icons";
import notesArtwork from "../../assets/dashboard-artwork/hero-notizen-nutzung-surface.webp";

interface NotesEmptyProps {
  windowMode: boolean;
  onCreate: () => void;
  onOpenSidebar?: () => void;
}

/** Leerer Zustand der Notizenfläche und Rückmeldung für ungültige Fensterlinks. */
export function NotesEmpty({ windowMode, onCreate, onOpenSidebar }: NotesEmptyProps) {
  const [artworkReady, setArtworkReady] = useState(false);
  return (
    <div className="notes-empty">
      {!windowMode ? (
        <div className="notes-empty-media" aria-hidden="true">
          <img
            className={`notes-empty-artwork${artworkReady ? " is-loaded" : ""}`}
            src={notesArtwork}
            alt=""
            decoding="async"
            loading="eager"
            fetchPriority="low"
            onLoad={() => setArtworkReady(true)}
            onError={() => setArtworkReady(false)}
          />
        </div>
      ) : null}
      <div className="notes-empty-content">
        {windowMode ? (
          <div className="notes-empty-icon" aria-hidden="true">
            <NoteIcon className="h-6 w-6" />
          </div>
        ) : null}
        <strong>{windowMode ? "Seite nicht gefunden" : "Keine Seite geöffnet"}</strong>
        <span>
          {windowMode
            ? "Die Seite wurde gelöscht oder der Link ist ungültig."
            : "Wähle links eine Seite aus oder erstelle eine neue."}
        </span>
        {!windowMode ? (
          <div className="notes-empty-actions">
            {onOpenSidebar ? (
              <button type="button" className="quiet-button" onClick={onOpenSidebar}>
                Seiten öffnen
              </button>
            ) : null}
            <button type="button" className="quiet-button-primary" onClick={onCreate}>
              <PlusIcon className="h-4 w-4" /> Neue Seite
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
