import { TabBar } from "../../components/TabBar";
import { settingsTabGroups, settingsTabs, type VisibleSettingsTabId } from "./settingsTabs";

interface SettingsTabNavigationProps {
  readonly activeId: VisibleSettingsTabId;
  readonly onSelect: (id: VisibleSettingsTabId) => void;
}

export function SettingsTabNavigation({ activeId, onSelect }: SettingsTabNavigationProps) {
  return (
    <div className="settings-tab-navigation">
      {settingsTabGroups.map((group) => {
        const items = settingsTabs
          .filter((tab) => tab.group === group.label)
          .map(({ id, label }) => ({ id, label }));

        return (
          <section
            key={group.id}
            className="settings-tab-group"
            aria-labelledby={`settings-tab-group-${group.id}`}
          >
            <h2 id={`settings-tab-group-${group.id}`} className="settings-tab-group-title">
              {group.label}
            </h2>
            <TabBar
              label={`${group.label} Einstellungen`}
              items={items}
              activeId={activeId}
              onSelect={onSelect}
            />
          </section>
        );
      })}
    </div>
  );
}
