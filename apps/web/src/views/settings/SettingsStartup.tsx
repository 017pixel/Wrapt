import { useMemo } from "react";
import { GitBranchIcon } from "../../components/icons";
import { Card } from "../../components/Card";
import { useNavigationRegistry } from "../../extensions/useNavigationRegistry";
import { useAppPreferences } from "../../stores/appPreferences";
import { isPageVisibleIn, useSidebarPreferences, type PageRouteId } from "../../stores/sidebarPreferences";

export function SettingsStartup() {
  const navigation = useNavigationRegistry();
  const defaultPage = useAppPreferences((state) => state.defaultPage);
  const setDefaultPage = useAppPreferences((state) => state.setDefaultPage);
  const hiddenPages = useSidebarPreferences((state) => state.hiddenPages);

  const options = useMemo(() => {
    const seen = new Set<PageRouteId>();
    return navigation.items.flatMap((item) => {
      const key = item.value.runtime.legacyVisibilityKey as PageRouteId | undefined;
      if (key === undefined || seen.has(key)) return [];
      seen.add(key);
      return [{ key, label: item.value.contribution.label, path: item.value.route.path }];
    });
  }, [navigation]);

  return (
    <div id="settings-start-app">
      <Card title="Start-App" subtitle="Welche Seite beim Öffnen von Wrapt geladen wird" action={<GitBranchIcon className="h-4 w-4 text-faint" />}>
        <p className="settings-section-note">Das Dashboard ist der Standard. Wählst du eine andere Seite, leitet Wrapt den Root-Pfad dorthin weiter. Die Auswahl bleibt lokal in diesem Browser.</p>
        <div className="settings-radio-list">
          {options.map((option) => {
            const isHidden = !isPageVisibleIn(hiddenPages, option.key);
            const selected = defaultPage === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                disabled={isHidden}
                onClick={() => setDefaultPage(option.key)}
                title={isHidden ? "Diese Seite ist ausgeblendet, erst wieder einblenden" : undefined}
                className={`settings-radio-row ${selected ? "is-selected" : ""}`}
              >
                <span className="settings-radio-copy"><strong>{option.label}</strong><small><code>{option.path}</code>{isHidden ? " · ausgeblendet" : ""}</small></span>
                <span className="settings-radio-dot" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
