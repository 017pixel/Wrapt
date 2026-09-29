export const settingsTabs = [
  { id: "allgemein", label: "Allgemein", group: "Wrapt" },
  { id: "benachrichtigungen", label: "Benachrichtigungen", group: "Wrapt" },
  { id: "system", label: "System", group: "Wrapt" },
  { id: "erweiterungen", label: "Erweiterungen", group: "Wrapt" },
  { id: "werkzeuge", label: "Werkzeuge", group: "Wrapt" },
  { id: "start-app", label: "Start-App", group: "Wrapt" },
  { id: "easter-eggs", label: "Easter Eggs", group: "Wrapt" },
  { id: "design", label: "Design", group: "Oberfläche & Bedienung" },
  { id: "navigation", label: "Navigation", group: "Oberfläche & Bedienung" },
  { id: "rechtsklick", label: "Rechtsklick", group: "Oberfläche & Bedienung" },
  { id: "layout", label: "Layout", group: "Oberfläche & Bedienung" },
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
export type SettingsTabId = VisibleSettingsTabId | "oberflaeche" | "workspace";

export interface SettingsNavigationTarget {
  readonly tab: VisibleSettingsTabId;
  readonly anchor?: string;
}

export const settingsTabIds: readonly SettingsTabId[] = [
  ...settingsTabs.map((tab) => tab.id),
  "oberflaeche",
  "workspace",
];

/** Alte Deep-Links bleiben trotz umbenannter Einstellungsbereiche gültig. */
export function normalizeSettingsTab(tab: SettingsTabId): VisibleSettingsTabId {
  if (tab === "oberflaeche") return "navigation";
  if (tab === "workspace") return "layout";
  return tab;
}
