import { ChevronRightIcon, CloseIcon, SearchIcon } from "../../components/icons";
import type { SettingsSearchResult } from "../../lib/settingsSearch";

interface SettingsSearchProps {
  readonly value: string;
  readonly results: readonly SettingsSearchResult[];
  readonly onChange: (value: string) => void;
  readonly onSelect: (result: SettingsSearchResult) => void;
}

export function SettingsSearch({ value, results, onChange, onSelect }: SettingsSearchProps) {
  const hasQuery = value.trim().length > 0;
  return (
    <div className="settings-search" data-testid="settings-search">
      <div className="settings-search-field">
        <SearchIcon className="h-4 w-4" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onChange("");
            if (event.key === "Enter" && results[0]) onSelect(results[0]);
          }}
          placeholder="Einstellungen suchen, z. B. Farben oder Neustart …"
          aria-label="Einstellungen durchsuchen"
          aria-controls={hasQuery ? "settings-search-results" : undefined}
        />
        {hasQuery ? (
          <button type="button" className="settings-search-clear" onClick={() => onChange("")} aria-label="Suche leeren">
            <CloseIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>
      {hasQuery ? (
        <div id="settings-search-results" className="settings-search-results" aria-live="polite">
          {results.length > 0 ? (
            results.slice(0, 8).map((result) => (
              <button
                key={result.entry.id}
                type="button"
                className="settings-search-result"
                onClick={() => onSelect(result)}
              >
                <span>
                  <strong>{result.entry.title}</strong>
                  <small>{result.entry.category} · {result.entry.description}</small>
                </span>
                <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))
          ) : (
            <p className="settings-search-empty">
              Keine passende Einstellung gefunden. Auch Begriffe wie „Aussehen“ oder „Design“ funktionieren.
            </p>
          )}
          {results.length > 8 ? <small className="settings-search-count">{results.length} Treffer, die ersten 8 werden angezeigt</small> : null}
        </div>
      ) : null}
    </div>
  );
}
