import { useEffect, useState } from "react";
import { appearanceThemePresets, type AppearanceTheme, type AppearanceThemePreset } from "@wrapt/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { wraptQueries } from "../lib/queryOptions";
import { applyAppearanceTheme } from "../lib/themeRuntime";
import { CheckIcon, RestoreIcon } from "./icons";

const labels: Record<keyof AppearanceTheme["colors"], string> = {
  accent: "Akzentfarbe",
  background: "Hintergrund",
  sidebar: "Sidebar",
  topbar: "Topbar",
  bottomBar: "Bottom-Bar",
};

export function AppearanceSettings() {
  const queryClient = useQueryClient();
  const appearance = useQuery(wraptQueries.appearance());
  const [theme, setTheme] = useState<AppearanceTheme | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (appearance.data?.theme) setTheme(appearance.data.theme);
  }, [appearance.data?.theme]);

  useEffect(() => {
    if (theme) applyAppearanceTheme(theme);
  }, [theme]);

  if (!theme) return <div className="settings-notification-skeleton"><span /><span /><span /></div>;

  const selectPreset = (preset: AppearanceThemePreset) => {
    if (preset === "custom") {
      setTheme((current) => current ? { ...current, preset } : current);
      return;
    }
    setTheme({ preset, colors: appearanceThemePresets[preset] });
  };

  const updateColor = (key: keyof AppearanceTheme["colors"], value: string) => {
    setTheme((current) => current ? { preset: "custom", colors: { ...current.colors, [key]: value } } : current);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await apiClient.saveAppearance(theme);
      if (result) {
        setTheme(result.theme);
        applyAppearanceTheme(result.theme);
        queryClient.setQueryData(wraptQueries.appearance().queryKey, result);
      }
      setMessage("Theme gespeichert.");
    } catch {
      setMessage("Das Theme konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="appearance-settings">
    <div className="appearance-preset-row"><label><span>Preset</span><select value={theme.preset} onChange={(event) => selectPreset(event.target.value as AppearanceThemePreset)}>{Object.keys(appearanceThemePresets).map((preset) => <option key={preset} value={preset}>{preset === "wrapt-standard" ? "Wrapt Standard" : preset === "graphit" ? "Graphit" : "Sage"}</option>)}<option value="custom">Eigene Farben</option></select></label><div className="appearance-preview" aria-label="Theme-Vorschau"><span style={{ background: theme.colors.accent }} /><span style={{ background: theme.colors.sidebar }} /><span style={{ background: theme.colors.bottomBar }} /></div></div>
    <div className="appearance-color-list">{(Object.keys(labels) as Array<keyof AppearanceTheme["colors"]>).map((key) => <label className="appearance-color-row" key={key}><span><strong>{labels[key]}</strong><small>{key === "accent" ? "Aktionen und Plugin-Akzente" : "Semantische Host-Fläche"}</small></span><span className="appearance-color-control"><input type="color" value={theme.colors[key]} onChange={(event) => updateColor(key, event.target.value)} aria-label={labels[key]} /><code>{theme.colors[key]}</code></span></label>)}</div>
    <div className="appearance-actions"><button type="button" className="quiet-button-primary" disabled={saving} onClick={() => void save()}><CheckIcon className="h-3.5 w-3.5" /> {saving ? "Speichert" : "Theme speichern"}</button><button type="button" className="quiet-button" disabled={saving} onClick={() => selectPreset("wrapt-standard")}><RestoreIcon className="h-3.5 w-3.5" /> Standard laden</button>{message ? <span role="status">{message}</span> : null}</div>
  </div>;
}
