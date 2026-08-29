import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ContextMenuSettings } from "../components/context-menu/ContextMenuSettings";
import { AppearanceSettings } from "../components/AppearanceSettings";
import { ExtensionSettings } from "../components/extensions/ExtensionSettings";
import { useHashTab } from "../lib/hashTabs";
import { searchSettings, type SettingsSearchResult } from "../lib/settingsSearch";
import { wraptQueries } from "../lib/queryOptions";
import { useRouteActivity } from "../lib/routeActivity";
import { SettingsSearch } from "./settings/SettingsSearch";
import { SettingsGeneral } from "./settings/SettingsGeneral";
import { SettingsNavigation } from "./settings/SettingsNavigation";
import { SettingsNotifications } from "./settings/SettingsNotifications";
import { SettingsStartup } from "./settings/SettingsStartup";
import { SettingsSystem } from "./settings/SettingsSystem";
import { SettingsUsage } from "./settings/SettingsUsage";
import { SettingsWorkspace } from "./settings/SettingsWorkspace";
import {
  normalizeSettingsTab,
  settingsTabIds,
  settingsTabs,
  type SettingsNavigationTarget,
} from "./settings/settingsTabs";
import "../components/appearance.css";
import "./settings/settings.css";

const TAB_HASH_PREFIX = "einstellungen:";

export function Settings() {
  const routeActive = useRouteActivity();
  const health = useQuery({ ...wraptQueries.health(), enabled: routeActive });
  const dashboardConfig = useQuery({ ...wraptQueries.dashboardConfig(), enabled: routeActive });
  const [query, setQuery] = useState("");
  const [pendingTarget, setPendingTarget] = useState<SettingsNavigationTarget | null>(null);
  const [tab, setTab] = useHashTab(settingsTabIds, TAB_HASH_PREFIX, "allgemein");
  const activeTab = normalizeSettingsTab(tab);
  const results = useMemo(() => searchSettings(query), [query]);

  useEffect(() => {
    if (pendingTarget === null || pendingTarget.anchor === undefined) return;
    const anchor = pendingTarget.anchor;
    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(anchor);
      if (element === null) {
        setPendingTarget(null);
        return;
      }
      const highlightTarget = element.closest("#restart-controls") ?? element;
      highlightTarget.scrollIntoView({ behavior: "smooth", block: "start" });
      highlightTarget.classList.add("is-search-target", "is-active");
      window.setTimeout(() => highlightTarget.classList.remove("is-search-target", "is-active"), 2_000);
      setPendingTarget(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, pendingTarget]);

  const navigateTo = (target: SettingsNavigationTarget) => {
    setTab(target.tab);
    setPendingTarget(target);
  };

  const selectSearchResult = (result: SettingsSearchResult) => {
    setQuery("");
    navigateTo(result.entry);
  };

  return (
    <div className="page-scroll">
      <div className="page-frame max-w-4xl settings-page">
        <header className="settings-page-heading">
          <div>
            <span className="settings-eyebrow">Workbench verwalten</span>
            <h1>Einstellungen</h1>
            <p>Finde Bereiche schnell, ändere sie direkt und behalte den Überblick.</p>
          </div>
          <span className="settings-heading-version">{health.data?.version ?? "Version wird geladen"}</span>
        </header>

        <SettingsSearch
          value={query}
          results={results}
          onChange={setQuery}
          onSelect={selectSearchResult}
        />

        <nav className="settings-tabs" aria-label="Einstellungsbereiche">
          {settingsTabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeTab === id}
              className={`settings-tab ${activeTab === id ? "is-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="settings-tab-content">
          {activeTab === "allgemein" ? (
            <SettingsGeneral
              version={health.data?.version}
              healthStatus={health.data?.status}
              onNavigate={navigateTo}
            />
          ) : null}
          {activeTab === "design" ? (
            <div id="settings-design">
              <section className="document-section">
                <header className="section-heading">
                  <div>
                    <h2 className="section-title">Design</h2>
                    <p className="section-subtitle">
                      Themes, Vorlagen und eigene Farben für die gesamte Workbench
                    </p>
                  </div>
                </header>
                <AppearanceSettings />
              </section>
            </div>
          ) : null}
          {activeTab === "navigation" ? <SettingsNavigation config={dashboardConfig.data} /> : null}
          {activeTab === "rechtsklick" ? <div id="settings-context-menu"><ContextMenuSettings /></div> : null}
          {activeTab === "benachrichtigungen" ? <SettingsNotifications /> : null}
          {activeTab === "system" ? (
            <SettingsSystem
              onJumpToRestart={() => navigateTo({ tab: "system", anchor: "settings-system-restart" })}
            />
          ) : null}
          {activeTab === "erweiterungen" ? (
            <div id="settings-extensions">
              <section className="document-section">
                <header className="section-heading">
                  <div>
                    <h2 className="section-title">Erweiterungen</h2>
                    <p className="section-subtitle">
                      Lokale Extensions installieren, aktivieren und berechtigen
                    </p>
                  </div>
                </header>
                <ExtensionSettings />
              </section>
            </div>
          ) : null}
          {activeTab === "werkzeuge" ? <SettingsUsage /> : null}
          {activeTab === "workspace" ? <SettingsWorkspace /> : null}
          {activeTab === "start-app" ? <SettingsStartup /> : null}
        </div>

        <footer className="settings-system-footer"><span>{health.data?.appName ?? "Wrapt"}</span><strong>Version {health.data?.version ?? "–"}</strong><span>Lokale Remote-Entwicklungsumgebung</span></footer>
      </div>
    </div>
  );
}
