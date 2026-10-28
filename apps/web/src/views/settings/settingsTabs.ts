export const settingsTabs = [
  { id: "allgemein", label: "Allgemein", group: "Wrapt" },
  { id: "benachrichtigungen", label: "Benachrichtigungen", group: "Wrapt" },
  { id: "system", label: "System", group: "Wrapt" },
  { id: "erweiterungen", label: "Plugin-Berechtigungen", group: "Wrapt" },
  { id: "werkzeuge", label: "Nutzung & Limits", group: "Wrapt" },
  { id: "easter-eggs", label: "Easter Eggs", group: "Wrapt" },
  { id: "experimente", label: "Experimente", group: "Wrapt" },
  { id: "design", label: "Design", group: "Oberfläche & Bedienung" },
  { id: "navigation", label: "Navigation", group: "Oberfläche & Bedienung" },
  { id: "rechtsklick", label: "Rechtsklick", group: "Oberfläche & Bedienung" },
  { id: "workspaces", label: "Workspaces", group: "Verbindungen" },
] as const;

export const settingsTabGroups = [
  {
    id: "workbench",
    label: "Wrapt",
  },
  {
    id: "oberflaeche",
    label: "Oberfläche & Bedienung",
  },
  {
    id: "verbindungen",
    label: "Verbindungen",
  },
] as const;

export type VisibleSettingsTabId = (typeof settingsTabs)[number]["id"];
export type SettingsTabId = VisibleSettingsTabId | "oberflaeche" | "workspace" | "layout" | "start-app";

export interface SettingsNavigationTarget {
  readonly tab: VisibleSettingsTabId;
  readonly anchor?: string;
}

export const settingsTabIds: readonly SettingsTabId[] = [
  ...settingsTabs.map((tab) => tab.id),
  "oberflaeche",
  "workspace",
  "layout",
  "start-app",
];

/** Alte Deep-Links bleiben trotz umbenannter Einstellungsbereiche gültig. */
export function normalizeSettingsTab(tab: SettingsTabId): VisibleSettingsTabId {
  if (tab === "oberflaeche") return "navigation";
  if (tab === "workspace" || tab === "layout" || tab === "start-app") return "allgemein";
  return tab;
}
