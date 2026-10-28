import { SettingsShortcuts } from "./SettingsShortcuts";
import { useMemo } from "react";
import type { DashboardConfig } from "@wrapt/contracts";
import { EyeIcon } from "../../components/icons";
import { Card } from "../../components/Card";
import { useNavigationRegistry } from "../../extensions/useNavigationRegistry";
import { useDashboardPreferences, useDashboardSections } from "../../stores/dashboardPreferences";
import { allPageRoutes, useSidebarPreferences } from "../../stores/sidebarPreferences";

export function SettingsNavigation({ config }: { config: DashboardConfig | undefined }) {
  return (
    <div id="settings-navigation">
      <SettingsShortcuts />
      <div id="settings-navigation-dashboard">
        <Card
          title="Dashboard"
          subtitle="Bereiche für alle Clients ein- und ausblenden"
          action={<EyeIcon className="h-4 w-4 text-faint" />}
        >
          <p className="settings-section-note">
            Die zentrale Config legt Defaults und verfügbare Bereiche fest. Deine Auswahl wird auf dem Server gespeichert und gilt für alle Clients.
          </p>
          <DashboardSectionToggles config={config} />
        </Card>
      </div>
      <div id="settings-navigation-pages">
        <Card
          title="Seiten-Sichtbarkeit"
          subtitle="Navigationselemente global steuern"
          action={<EyeIcon className="h-4 w-4 text-faint" />}
        >
          <PageVisibilityToggles />
        </Card>
      </div>
    </div>
  );
}

function DashboardSectionToggles({ config }: { config: DashboardConfig | undefined }) {
  const toggleSection = useDashboardPreferences((state) => state.toggleSection);
  const hiddenSections = useDashboardPreferences((state) => state.hiddenSections);
  const sections = useDashboardSections();
  return (
    <div className="dashboard-settings-toggle-list">
      {sections.map(({ section, label, description }) => {
        const allowed = config?.sections[section] ?? true;
        const enabled = allowed && !hiddenSections.has(section);
        return (
          <button
            key={section}
            type="button"
            className="settings-toggle-row dashboard-settings-toggle-row"
            disabled={!allowed}
            onClick={() => toggleSection(section)}
            title={!allowed ? "Dieser Bereich ist in der zentralen Config deaktiviert" : undefined}
          >
            <span className="dashboard-settings-toggle-copy">
              <strong>{label}</strong>
              <small>{description}{!allowed ? " · in Config deaktiviert" : ""}</small>
            </span>
            <span
              className={`settings-toggle-switch ${enabled ? "is-on" : ""} ${!allowed ? "is-locked" : ""}`}
              role="switch"
              aria-checked={enabled}
              aria-disabled={!allowed}
              aria-label={label}
            >
              <span className="settings-toggle-thumb" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PageVisibilityToggles() {
  const togglePage = useSidebarPreferences((state) => state.togglePage);
  const hiddenPages = useSidebarPreferences((state) => state.hiddenPages);
  const navigation = useNavigationRegistry();
  const labels = useMemo(
    () => new Map(
      navigation.items.flatMap((item) => item.value.runtime.legacyVisibilityKey === undefined
        ? []
        : [[item.value.runtime.legacyVisibilityKey, item.value.contribution.label] as const]),
    ),
    [navigation],
  );

  return (
    <div className="space-y-1">
      <p className="settings-section-note">
        Deaktivierte Seiten werden in der Sidebar, der Dashboard-Navigation und der mobilen Navigation ausgeblendet.
      </p>
      {allPageRoutes.map((page) => {
        const isLocked = page === "settings";
        const isHidden = !isLocked && hiddenPages.has(page);
        const label = labels.get(page) ?? page;
        return (
          <button
            key={page}
            type="button"
            className="settings-toggle-row"
            disabled={isLocked}
            onClick={() => togglePage(page)}
            title={isLocked ? "Diese Seite bleibt immer sichtbar" : undefined}
          >
            <span className="text-[13px] text-text">
              {label}
              {isLocked ? <span className="ml-2 text-[11px] text-faint">, immer sichtbar</span> : null}
            </span>
            <span
              className={`settings-toggle-switch ${isHidden ? "" : "is-on"} ${isLocked ? "is-locked" : ""}`}
              role="switch"
              aria-checked={!isHidden}
              aria-disabled={isLocked}
              aria-label={label}
            >
              <span className="settings-toggle-thumb" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
