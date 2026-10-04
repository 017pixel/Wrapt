import { LayoutPanelIcon, PlusIcon, SearchIcon } from "../icons";

interface NoteMobileNavigationProps {
  sidebarOpen: boolean;
  onOpenPages: () => void;
  onSearch: () => void;
  onCreate: () => void;
}

/** Die häufigsten Notizaktionen bleiben auf dem Handy in Daumenreichweite. */
export function NoteMobileNavigation({ sidebarOpen, onOpenPages, onSearch, onCreate }: NoteMobileNavigationProps) {
  return (
    <nav className="notes-mobile-navigation" aria-label="Notiznavigation">
      <button type="button" aria-label="Seiten anzeigen" aria-expanded={sidebarOpen} onClick={onOpenPages}>
        <LayoutPanelIcon style={{ color: "currentColor" }} />
        <span>Seiten</span>
      </button>
      <button type="button" aria-label="Notizen durchsuchen" onClick={onSearch}>
        <SearchIcon style={{ color: "currentColor" }} />
        <span>Suchen</span>
      </button>
      <button type="button" aria-label="Neue Notiz erstellen" onClick={onCreate}>
        <PlusIcon style={{ color: "currentColor" }} />
        <span>Neue Seite</span>
      </button>
    </nav>
  );
}
