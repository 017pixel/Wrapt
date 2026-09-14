import { useEffect, useRef } from "react";
import { scrollSettingsTabsByWheel } from "./settingsTabScroll";
import { settingsTabs, type VisibleSettingsTabId } from "./settingsTabs";
import "./settings-tabs.css";

interface SettingsTabBarProps {
  readonly activeTab: VisibleSettingsTabId;
  readonly onSelect: (tab: VisibleSettingsTabId) => void;
}

/**
 * Horizontale Tab-Leiste der Einstellungen. Das Mausrad scrollt über der Leiste
 * seitwärts; die dünne Scrollbar liegt sichtbar unter den Tabs.
 */
export function SettingsTabBar({ activeTab, onSelect }: SettingsTabBarProps) {
  const listRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = listRef.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      if (scrollSettingsTabsByWheel(element, event.deltaX, event.deltaY, event.deltaMode)) {
        event.preventDefault();
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <nav ref={listRef} className="settings-tabs" aria-label="Einstellungsbereiche" tabIndex={0}>
      {settingsTabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={activeTab === id}
          className={`settings-tab ${activeTab === id ? "is-active" : ""}`}
          onClick={() => onSelect(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
