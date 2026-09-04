import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  contextMenuConfigSurfaces,
  defaultContextMenuConfig,
  type ContextMenuConfig,
  type ContextMenuConfigResponse,
  type ContextMenuConfigSurface,
} from "@wrapt/contracts";
import { MinusIcon, PlusIcon } from "../icons";
import { Card } from "../Card";
import { useNavigationRegistry } from "../../extensions/useNavigationRegistry";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { rankedToolIds, useToolUsage } from "../../stores/toolUsage";

const surfaceLabels: Record<ContextMenuConfigSurface, string> = {
  "host.context-menu.project": "Sidebar: Orbit-Projekte",
  "host.context-menu.file": "Dateibaum: Dateien",
  "host.context-menu.directory": "Dateibaum: Ordner",
  "host.context-menu.orbit-node": "Orbit: Knoten",
  "host.context-menu.orbit-pane": "Orbit: freie Fläche",
  "host.context-menu.preview": "Preview-Tabs und Gruppen",
  "host.context-menu.terminal": "Terminal-Sidebar",
  "host.context-menu.git": "Git",
  "host.context-menu.agent-session": "Agent-Sitzungen",
  "host.context-menu.browser": "Chromium-Browser",
  "host.context-menu.tool": "Werkzeuge und Panels",
  "host.context-menu.statusbar": "Statusleiste",
  "host.context-menu.empty": "Freie Host-Flächen",
  "host.context-menu.extensions": "Plugins und Extensions",
};

export function ContextMenuSettings() {
  const queryClient = useQueryClient();
  const navigation = useNavigationRegistry();
  const usageEntries = useToolUsage((state) => state.entries);
  const query = useQuery(wraptQueries.contextMenu());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const config = query.data?.contextMenu ?? defaultContextMenuConfig;
  const tools = navigation.items.filter((item) => item.value.contribution.group !== "account" && item.value.contribution.group !== "system");
  const autoIds = rankedToolIds(usageEntries, tools.map((item) => item.contributionId));

  const save = async (next: ContextMenuConfig) => {
    setSaving(true);
    setMessage("");
    try {
      const response = await apiClient.saveContextMenu(next);
      if (response) queryClient.setQueryData<ContextMenuConfigResponse>(wraptQueries.contextMenu().queryKey, response);
      setMessage("Gespeichert.");
    } catch {
      setMessage("Die Rechtsklick-Einstellungen konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const updateManualSlot = (index: number, value: string) => {
    const slots = [config.quickActions.manual[0] ?? "", config.quickActions.manual[1] ?? "", config.quickActions.manual[2] ?? ""];
    slots[index] = value;
    void save({ ...config, quickActions: { mode: "manual", manual: slots.filter((id, slot, values) => id && values.indexOf(id) === slot) } });
  };

  const toolLabel = (id: string) => tools.find((item) => item.contributionId === id)?.value.contribution.label ?? id;
  return <div className="context-menu-settings">
    <Card title="Rechtsklick-Menüs">
      <button type="button" className="settings-toggle-row" disabled={saving} onClick={() => void save({ ...config, enabled: !config.enabled })}>
        <span><strong>Globale Menüs</strong></span>
        <span className={`settings-toggle-switch ${config.enabled ? "is-on" : ""}`} role="switch" aria-checked={config.enabled}><span className="settings-toggle-thumb" /></span>
      </button>
    </Card>

    <Card title="Schnellaktionen">
      <div className="context-menu-mode" role="group" aria-label="Schnellaktionen auswählen">
        {(["auto", "manual"] as const).map((mode) => <button key={mode} type="button" className={config.quickActions.mode === mode ? "is-active" : ""} disabled={saving} onClick={() => void save({ ...config, quickActions: { ...config.quickActions, mode } })}>{mode === "auto" ? "Automatisch" : "Manuell"}</button>)}
      </div>
      {config.quickActions.mode === "auto" ? <div className="context-menu-quick-preview" aria-label="Automatische Top 3">
        {autoIds.length ? autoIds.map((id, index) => <span key={id}><b>{index + 1}</b>{toolLabel(id)}</span>) : <p>Noch keine Werkzeugnutzung erfasst.</p>}
      </div> : <div className="context-menu-slot-list">
        {[0, 1, 2].map((index) => <label key={index}><span>Platz {index + 1}</span><select value={config.quickActions.manual[index] ?? ""} disabled={saving} onChange={(event) => updateManualSlot(index, event.target.value)}><option value="">Nicht belegt</option>{tools.map((item) => <option key={item.contributionId} value={item.contributionId}>{item.value.contribution.label}</option>)}</select></label>)}
      </div>}
    </Card>

    <Card title="Bereiche">
      <div className="context-menu-surface-list">
        {contextMenuConfigSurfaces.map((surface) => {
          const enabled = config.surfaces[surface]?.enabled ?? true;
          return <button key={surface} type="button" className="settings-toggle-row" disabled={saving || !config.enabled} onClick={() => void save({ ...config, surfaces: { ...config.surfaces, [surface]: { enabled: !enabled } } })}>
            <span><strong>{surfaceLabels[surface]}</strong><small>{surface}</small></span>
            <span className={`settings-toggle-switch ${enabled ? "is-on" : ""}`} role="switch" aria-checked={enabled}><span className="settings-toggle-thumb" /></span>
          </button>;
        })}
        <div className="context-menu-iframe-note"><strong>Eingebettete Anwendungen</strong><span>T3 Code, Hermes-Verwaltung, Code-Server, Preview-Runtime und Plugin-Frames verwenden ihr eigenes Menü.</span></div>
      </div>
    </Card>

    <Card title="Statusleiste">
      <div className="context-menu-font-size">
        <span>Schriftgröße</span>
        <div><button type="button" disabled={saving || config.statusBar.fontSizePx <= 10} onClick={() => void save({ ...config, statusBar: { ...config.statusBar, fontSizePx: Math.max(10, config.statusBar.fontSizePx - 1) } })} aria-label="Schrift verkleinern"><MinusIcon className="h-4 w-4" /></button><input type="range" min={10} max={20} step={1} value={config.statusBar.fontSizePx} disabled={saving} onChange={(event) => void save({ ...config, statusBar: { ...config.statusBar, fontSizePx: Number(event.target.value) } })} aria-label="Statusleisten-Schriftgröße" /><output>{config.statusBar.fontSizePx}px</output><button type="button" disabled={saving || config.statusBar.fontSizePx >= 20} onClick={() => void save({ ...config, statusBar: { ...config.statusBar, fontSizePx: Math.min(20, config.statusBar.fontSizePx + 1) } })} aria-label="Schrift vergrößern"><PlusIcon className="h-4 w-4" /></button></div>
      </div>
      <button type="button" className="settings-toggle-row" disabled={saving} onClick={() => void save({ ...config, statusBar: { ...config.statusBar, alwaysShowLimits: !config.statusBar.alwaysShowLimits } })}>
        <span><strong>Limits immer anzeigen</strong></span>
        <span className={`settings-toggle-switch ${config.statusBar.alwaysShowLimits ? "is-on" : ""}`} role="switch" aria-checked={config.statusBar.alwaysShowLimits}><span className="settings-toggle-thumb" /></span>
      </button>
    </Card>
    {message ? <p className="context-menu-settings-message" role="status">{message}</p> : null}
  </div>;
}
