import { useEffect, useState } from "react";
import {
  appearanceThemeCatalog,
  appearanceThemePresetIds,
  appearanceThemePresets,
  type AppearanceColors,
  type AppearanceResponse,
  type AppearanceTheme,
  type AppearanceThemePresetId,
} from "@wrapt/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { wraptQueries } from "../lib/queryOptions";
import { applyAppearanceTheme, themeColorToHex } from "../lib/themeRuntime";
import { CheckIcon, RestoreIcon } from "./icons";

type ColorKey = keyof AppearanceColors;
type ColorGroup = {
  id: string;
  label: string;
  description: string;
  keys: readonly ColorKey[];
};

const colorLabels: Record<ColorKey, { label: string; hint: string }> = {
  accent: { label: "Akzent", hint: "Primäre Aktionen und aktive Zustände" },
  accentContrast: { label: "Akzenttext", hint: "Text auf gefüllten Akzentflächen" },
  background: { label: "Grundfläche", hint: "Hintergrund der gesamten Workbench" },
  surface: { label: "Karte", hint: "Standardfläche für Inhalte" },
  surfaceRaised: { label: "Erhöht", hint: "Hervorgehobene Karten und Eingaben" },
  surfaceOverlay: { label: "Overlay", hint: "Dialoge, Menüs und schwebende Flächen" },
  sidebar: { label: "Sidebar", hint: "Werkzeug- und Navigationsbereich" },
  topbar: { label: "Topbar", hint: "Obere Werkzeugleisten" },
  bottomBar: { label: "Bottom-Bar", hint: "Untere Leisten und mobile Navigation" },
  text: { label: "Text", hint: "Primärer Inhalt und Überschriften" },
  muted: { label: "Gedämpfter Text", hint: "Sekundäre Informationen" },
  faint: { label: "Dezenter Text", hint: "Metadaten und Hinweise" },
  border: { label: "Rahmen", hint: "Standardlinien und Trennungen" },
  borderStrong: { label: "Starker Rahmen", hint: "Fokus, aktive Kontrollen und Abgrenzungen" },
  input: { label: "Eingabe", hint: "Hintergrund von Formularfeldern" },
  hover: { label: "Hover", hint: "Fläche beim Darüberfahren oder Antippen" },
  selected: { label: "Ausgewählt", hint: "Aktive Zeilen und Auswahlflächen" },
  focus: { label: "Fokus", hint: "Tastaturfokus und sichtbare Orientierung" },
  success: { label: "Erfolg", hint: "Bereit, gespeichert oder erfolgreich" },
  warning: { label: "Warnung", hint: "Hinweise und Aufmerksamkeit" },
  danger: { label: "Fehler", hint: "Fehler und destruktive Aktionen" },
  info: { label: "Info", hint: "Informative Statusanzeigen" },
};

const colorGroups: readonly ColorGroup[] = [
  {
    id: "surfaces",
    label: "Flächen",
    description: "Grundfläche und einzelne UI-Bereiche",
    keys: ["background", "surface", "surfaceRaised", "surfaceOverlay", "sidebar", "topbar", "bottomBar"],
  },
  {
    id: "text",
    label: "Text",
    description: "Lesbarkeit für Inhalt, Metadaten und Hinweise",
    keys: ["text", "muted", "faint"],
  },
  {
    id: "interaction",
    label: "Interaktion",
    description: "Akzente, Hover, Auswahl, Rahmen und Eingaben",
    keys: ["accent", "accentContrast", "hover", "selected", "focus", "border", "borderStrong", "input"],
  },
  {
    id: "status",
    label: "Status",
    description: "Semantische Farben für Rückmeldungen",
    keys: ["success", "warning", "danger", "info"],
  },
];

export function AppearanceSettings() {
  const queryClient = useQueryClient();
  const appearanceQuery = wraptQueries.appearance();
  const appearance = useQuery(appearanceQuery);
  const [theme, setTheme] = useState<AppearanceTheme | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (appearance.data?.theme) setTheme(appearance.data.theme);
  }, [appearance.data?.theme]);

  useEffect(() => {
    if (theme) applyAppearanceTheme(theme);
  }, [theme]);

  if (appearance.isError) return <p className="appearance-message is-error" role="alert">Die Theme-Einstellungen konnten nicht geladen werden.</p>;
  if (!theme) return <div className="settings-notification-skeleton"><span /><span /><span /></div>;

  const publishTheme = (next: AppearanceTheme) => {
    setTheme(next);
    queryClient.setQueryData<AppearanceResponse>(appearanceQuery.queryKey, (current) => current ? { ...current, theme: next } : current);
  };

  const selectPreset = (preset: AppearanceThemePresetId | "custom") => {
    if (preset === "custom") {
      publishTheme({ ...theme, preset });
      setMessage(null);
      return;
    }
    publishTheme({ preset, colors: appearanceThemePresets[preset] });
    setMessage(null);
  };

  const updateColor = (key: ColorKey, value: string) => {
    publishTheme({ preset: "custom", colors: { ...theme.colors, [key]: value } });
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await apiClient.saveAppearance(theme);
      if (result) {
        setTheme(result.theme);
        applyAppearanceTheme(result.theme);
        queryClient.setQueryData(appearanceQuery.queryKey, result);
      }
      setMessage("Theme gespeichert.");
    } catch {
      setMessage("Das Theme konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const selectedPreset = appearanceThemePresetIds.includes(theme.preset as AppearanceThemePresetId)
    ? theme.preset
    : null;
  const legacyPreset = selectedPreset === null && theme.preset !== "custom" ? theme.preset : null;

  return (
    <div className="appearance-settings">
      <section id="settings-design-themes" className="appearance-theme-section" aria-labelledby="appearance-theme-title">
        <header className="appearance-section-heading">
          <div>
            <h3 id="appearance-theme-title">Vorgefertigte Themes</h3>
            <p>Die ersten sechs Paletten entsprechen den dunklen Varianten aus T3 Code.</p>
          </div>
          <span className="appearance-count">{appearanceThemePresetIds.length}</span>
        </header>
        {legacyPreset ? <p className="appearance-legacy-note" role="status">Das alte Preset „{legacyPreset}“ bleibt kompatibel. Wähle ein neues Theme, um die aktuelle Sammlung zu verwenden.</p> : null}
        {(["T3 Code", "VS Code inspiriert", "Wrapt entworfen"] as const).map((group) => (
          <div className="appearance-theme-group" key={group}>
            <h4>{group}</h4>
            <div className="appearance-theme-grid">
              {appearanceThemeCatalog.filter((item) => item.group === group).map((item) => {
                const colors = appearanceThemePresets[item.id];
                const isSelected = selectedPreset === item.id;
                return (
                  <button
                    type="button"
                    className={`appearance-theme-card ${isSelected ? "is-selected" : ""}`}
                    key={item.id}
                    data-theme-id={item.id}
                    aria-label={item.label}
                    aria-pressed={isSelected}
                    onClick={() => selectPreset(item.id)}
                  >
                    <span className="appearance-theme-swatch" aria-hidden="true">
                      <span style={{ backgroundColor: colors.background }} />
                      <span style={{ backgroundColor: colors.surface }} />
                      <span style={{ backgroundColor: colors.accent }} />
                    </span>
                    <span className="appearance-theme-copy">
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                    {isSelected ? <CheckIcon className="appearance-theme-check" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button type="button" className={`appearance-custom-option ${theme.preset === "custom" ? "is-selected" : ""}`} aria-label="Eigene Farben" aria-pressed={theme.preset === "custom"} onClick={() => selectPreset("custom")}>
          <span className="appearance-custom-mark" aria-hidden="true">+</span>
          <span><strong>Eigene Farben</strong><small>Jede sichtbare Rolle separat anpassen</small></span>
          {theme.preset === "custom" ? <CheckIcon className="appearance-theme-check" /> : null}
        </button>
      </section>

      <section id="settings-design-colors" className="appearance-customizer" aria-labelledby="appearance-customizer-title">
        <header className="appearance-section-heading">
          <div>
            <h3 id="appearance-customizer-title">Theme anpassen</h3>
            <p>Ändere einzelne Bereiche, ohne ein Preset als Ausgangspunkt zu verlieren.</p>
          </div>
          <span className="appearance-customizer-state">{theme.preset === "custom" ? "Eigene Auswahl" : "Preset"}</span>
        </header>
        <div className="appearance-color-groups">
          {colorGroups.map((group) => (
            <section className="appearance-color-group" key={group.id} aria-labelledby={`appearance-group-${group.id}`}>
              <header><div><h4 id={`appearance-group-${group.id}`}>{group.label}</h4><p>{group.description}</p></div><span>{group.keys.length}</span></header>
              <div className="appearance-color-grid">
                {group.keys.map((key) => {
                  const color = theme.colors[key];
                  const label = colorLabels[key];
                  return (
                    <label className="appearance-color-field" key={key}>
                      <span><strong>{label.label}</strong><small>{label.hint}</small></span>
                      <span className="appearance-color-control">
                        <input type="color" value={themeColorToHex(color) ?? "#000000"} onChange={(event) => updateColor(key, event.target.value)} aria-label={`${label.label} ändern`} />
                        <code>{color}</code>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <div className="appearance-actions">
        <button type="button" className="quiet-button-primary" disabled={saving} onClick={() => void save()}><CheckIcon className="h-3.5 w-3.5" /> {saving ? "Speichert" : "Theme speichern"}</button>
        <button type="button" className="quiet-button" disabled={saving} onClick={() => selectPreset("t3-code")}><RestoreIcon className="h-3.5 w-3.5" /> T3 Code laden</button>
        {message ? <span className={message.includes("konnte") ? "is-error" : ""} role="status">{message}</span> : null}
      </div>
      <p className="appearance-save-note">Änderungen werden live angezeigt und erst mit „Theme speichern“ in der Projektkonfiguration gesichert.</p>
    </div>
  );
}
