import { useState, type ReactNode } from "react";
import { InboxIcon } from "./icons";
import "./empty-state.css";

/**
 * Leerer Zustand mit optionaler Hintergrundstimmung. Das dekorative Artwork
 * läuft ohne eigene Bildbox in die umgebende Fläche aus.
 */
export function EmptyState({
  artwork,
  icon,
  title,
  description,
  action,
}: {
  /** Pfad des Hintergrundmotivs. Ohne Angabe wird das Icon verwendet. */
  artwork?: string;
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const [loadedArtwork, setLoadedArtwork] = useState<string | null>(null);
  return (
    <div className={`empty-state${artwork ? " has-artwork" : ""}`}>
      {artwork ? (
        <div className="empty-state-media" aria-hidden="true">
          <img
            key={artwork}
            className={`empty-state-artwork${loadedArtwork === artwork ? " is-loaded" : ""}`}
            src={artwork}
            alt=""
            decoding="async"
            loading="eager"
            fetchPriority="low"
            onLoad={() => setLoadedArtwork(artwork)}
            onError={() => setLoadedArtwork(null)}
          />
        </div>
      ) : (
        <div className="empty-state-icon" aria-hidden="true">
          {icon ?? <InboxIcon className="h-6 w-6" />}
        </div>
      )}
      <div className="empty-state-copy">
        <h2 className="empty-state-title">{title}</h2>
        {description ? <p className="empty-state-description">{description}</p> : null}
      </div>
      {action ? <div className="empty-state-actions">{action}</div> : null}
    </div>
  );
}
