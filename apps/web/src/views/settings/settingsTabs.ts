export const settingsTabs = [
  { id: "allgemein", label: "Allgemein" },
  { id: "design", label: "Design" },
  { id: "navigation", label: "Navigation" },
  { id: "rechtsklick", label: "Rechtsklick" },
  { id: "benachrichtigungen", label: "Benachrichtigungen" },
  { id: "system", label: "System" },
  { id: "erweiterungen", label: "Erweiterungen" },
  { id: "werkzeuge", label: "Werkzeuge" },
  { id: "workspace", label: "Workspace" },
  { id: "start-app", label: "Start-App" },
] as const;

export type VisibleSettingsTabId = (typeof settingsTabs)[number]["id"];
export type SettingsTabId = VisibleSettingsTabId | "oberflaeche";

export interface SettingsNavigationTarget {
  readonly tab: VisibleSettingsTabId;
  readonly anchor?: string;
}

export const settingsTabIds: readonly SettingsTabId[] = [
  ...settingsTabs.map((tab) => tab.id),
  "oberflaeche",
];

/** Alte Deep-Links bleiben gültig, obwohl der Bereich jetzt Navigation heißt. */
export function normalizeSettingsTab(tab: SettingsTabId): VisibleSettingsTabId {
  return tab === "oberflaeche" ? "navigation" : tab;
}
