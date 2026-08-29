import type { VisibleSettingsTabId } from "../views/settings/settingsTabs";

export const MAX_SETTINGS_TYPO_DISTANCE = 3;

export interface SettingsSearchEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly tab: VisibleSettingsTabId;
  readonly anchor: string;
  readonly aliases: readonly string[];
}

export interface SettingsSearchResult {
  readonly entry: SettingsSearchEntry;
  readonly score: number;
}

export const settingsSearchCatalog: readonly SettingsSearchEntry[] = [
  {
    id: "general",
    title: "Allgemein",
    description: "Überblick, Schnellzugriffe und grundlegende Informationen",
    category: "Allgemein",
    tab: "allgemein",
    anchor: "settings-general",
    aliases: ["Übersicht", "Einstellungen", "Hauptseite", "Optionen"],
  },
  {
    id: "general-restart",
    title: "Schnellzugriff auf Systemfunktionen",
    description: "Frontend, Backend oder beide Dienste neu bauen und starten",
    category: "Allgemein",
    tab: "allgemein",
    anchor: "settings-general-restart",
    aliases: ["System", "Dienst", "Neustart", "Restart", "Reload", "Server", "Frontend", "Backend", "Beides"],
  },
  {
    id: "app-install",
    title: "App installieren",
    description: "Wrapt auf dem Homescreen oder Desktop ablegen",
    category: "Allgemein",
    tab: "allgemein",
    anchor: "settings-general-install",
    aliases: ["PWA", "Homescreen", "Desktop", "Verknüpfung", "Browser-App"],
  },
  {
    id: "version",
    title: "Version",
    description: "Aktueller Release- und Backend-Status",
    category: "Allgemein",
    tab: "allgemein",
    anchor: "settings-general-version",
    aliases: ["Release", "Build", "App-Version", "Versionierung", "Changelog"],
  },
  {
    id: "design",
    title: "Design",
    description: "Themes, Vorlagen und eigene Farben verwalten",
    category: "Design",
    tab: "design",
    anchor: "settings-design",
    aliases: ["Aussehen", "Farben", "Farbe", "Theme", "Themes", "Darstellung", "Style", "Layout", "Vorlage", "Presets", "Eigene Designs", "Customizer"],
  },
  {
    id: "design-presets",
    title: "Theme-Vorlagen",
    description: "Vorgefertigte Paletten auswählen und sofort anwenden",
    category: "Design",
    tab: "design",
    anchor: "settings-design-themes",
    aliases: ["Designvorlagen", "Presets", "Paletten", "T3 Code", "Vorlagen"],
  },
  {
    id: "design-colors",
    title: "Eigene Farben",
    description: "Einzelne Farbrollen für die Workbench anpassen",
    category: "Design",
    tab: "design",
    anchor: "settings-design-colors",
    aliases: ["Eigenes Design", "Farben ändern", "Farbwahl", "Farbeditor", "Custom Theme"],
  },
  {
    id: "navigation",
    title: "Navigation",
    description: "Dashboard, Sidebar und sichtbare Seiten verwalten",
    category: "Navigation",
    tab: "navigation",
    anchor: "settings-navigation",
    aliases: ["Oberfläche", "Sidebar", "Seiten", "Menü", "Dashboard", "Orbit"],
  },
  {
    id: "dashboard",
    title: "Dashboard-Bereiche",
    description: "Karten und Bereiche auf dem Dashboard ein- oder ausblenden",
    category: "Navigation",
    tab: "navigation",
    anchor: "settings-navigation-dashboard",
    aliases: ["Dashboard", "Übersicht", "Widgets", "Karten"],
  },
  {
    id: "orbit-sidebar",
    title: "Orbit-Sidebar",
    description: "Werkzeuge, Previews und Blöcke im Infinite Canvas verwalten",
    category: "Navigation",
    tab: "navigation",
    anchor: "settings-navigation-orbit",
    aliases: ["Canvas", "Infinite Canvas", "Orbit-Werkzeuge", "Palette"],
  },
  {
    id: "page-visibility",
    title: "Seiten-Sichtbarkeit",
    description: "Seiten global in Sidebar, Dashboard und Mobile einblenden",
    category: "Navigation",
    tab: "navigation",
    anchor: "settings-navigation-pages",
    aliases: ["Seiten anzeigen", "Navigationselemente", "sichtbar", "ausblenden"],
  },
  {
    id: "context-menu",
    title: "Rechtsklick-Menüs",
    description: "Kontextmenüs, Schnellaktionen und Statusleiste konfigurieren",
    category: "Rechtsklick",
    tab: "rechtsklick",
    anchor: "settings-context-menu",
    aliases: ["Kontextmenü", "Context Menu", "Rechtsklick", "Schnellaktionen", "Statusleiste"],
  },
  {
    id: "notifications",
    title: "Benachrichtigungen",
    description: "Toasts, Push und Quellen einzeln verwalten",
    category: "Benachrichtigungen",
    tab: "benachrichtigungen",
    anchor: "settings-notifications",
    aliases: ["Meldungen", "Alerts", "Hinweise", "Toast", "Push", "Systemmeldungen"],
  },
  {
    id: "system",
    title: "System",
    description: "Neustart, T3-Code-Kanal und Sicherheit",
    category: "System",
    tab: "system",
    anchor: "settings-system",
    aliases: ["Dienst", "Server", "Betrieb", "Sicherheit", "Infrastruktur"],
  },
  {
    id: "restart-frontend",
    title: "Frontend neu starten",
    description: "Nur die Oberfläche neu bauen und laden",
    category: "System",
    tab: "system",
    anchor: "settings-system-restart",
    aliases: ["Web", "UI", "Oberfläche neu bauen", "Frontend Build"],
  },
  {
    id: "restart-backend",
    title: "Backend neu starten",
    description: "Server neu bauen und Dienst neu starten",
    category: "System",
    tab: "system",
    anchor: "settings-system-restart",
    aliases: ["Server neu starten", "API", "Fastify", "Backend Build"],
  },
  {
    id: "restart-both",
    title: "Frontend und Backend neu starten",
    description: "Oberfläche und Server gemeinsam aktualisieren",
    category: "System",
    tab: "system",
    anchor: "settings-system-restart",
    aliases: ["Beides neu starten", "Alles neu starten", "Komplett neu bauen"],
  },
  {
    id: "t3-channel",
    title: "T3 Code Kanal",
    description: "Zwischen Stable und Nightly wechseln",
    category: "System",
    tab: "system",
    anchor: "settings-system-t3",
    aliases: ["T3", "Stable", "Nightly", "Kanal", "Version von T3"],
  },
  {
    id: "extensions",
    title: "Erweiterungen",
    description: "Lokale Extensions installieren, aktivieren und berechtigen",
    category: "Erweiterungen",
    tab: "erweiterungen",
    anchor: "settings-extensions",
    aliases: ["Extensions", "Plugins", "Add-ons", "Erweiterung", "Plugin"],
  },
  {
    id: "usage",
    title: "Limitüberwachung",
    description: "Limits und Warnungen je Werkzeug verwalten",
    category: "Werkzeuge",
    tab: "werkzeuge",
    anchor: "settings-usage",
    aliases: ["Nutzung", "Usage", "Quoten", "Kontingent", "Token", "Kosten", "Limit"],
  },
  {
    id: "workspace",
    title: "Workspace",
    description: "Geöffnete Panels und Arbeitsflächen verwalten",
    category: "Workspace",
    tab: "workspace",
    anchor: "settings-workspace",
    aliases: ["Arbeitsfläche", "Panels", "Fenster", "lokaler Zustand", "Speicher", "Zurücksetzen"],
  },
  {
    id: "startup",
    title: "Start-App",
    description: "Festlegen, welche Seite beim Öffnen geladen wird",
    category: "Start-App",
    tab: "start-app",
    anchor: "settings-start-app",
    aliases: ["Startup", "Startseite", "beim Start", "Öffnen", "Standardseite", "Default Page"],
  },
];

export function normalizeSettingsSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function levenshteinDistanceWithin(left: string, right: string, limit = MAX_SETTINGS_TYPO_DISTANCE): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        previous[rightIndex - 1]! + cost,
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length]!;
}

function fieldScore(query: string, field: string): number | null {
  if (field === query) return 0;
  if (field.includes(query)) return 1;
  const queryTokens = query.split(" ").filter(Boolean);
  const fieldTokens = field.split(" ").filter(Boolean);
  if (queryTokens.some((token) => token.length < 3)) return null;
  let totalDistance = 0;
  for (const queryToken of queryTokens) {
    const distances = fieldTokens.map((fieldToken) => levenshteinDistanceWithin(queryToken, fieldToken));
    const bestDistance = Math.min(...distances);
    if (bestDistance > MAX_SETTINGS_TYPO_DISTANCE) return null;
    totalDistance += bestDistance;
  }
  return totalDistance <= MAX_SETTINGS_TYPO_DISTANCE ? 10 + totalDistance : null;
}

function entryScore(query: string, entry: SettingsSearchEntry): number | null {
  const fields = [entry.title, entry.description, ...entry.aliases].map(normalizeSettingsSearchText);
  const scores = fields.map((field) => fieldScore(query, field)).filter((score): score is number => score !== null);
  return scores.length > 0 ? Math.min(...scores) : null;
}

export function searchSettings(query: string, catalog: readonly SettingsSearchEntry[] = settingsSearchCatalog): SettingsSearchResult[] {
  const normalizedQuery = normalizeSettingsSearchText(query);
  if (!normalizedQuery) return [];
  return catalog
    .map((entry) => ({ entry, score: entryScore(normalizedQuery, entry) }))
    .filter((result): result is SettingsSearchResult => result.score !== null)
    .sort((left, right) => left.score - right.score || left.entry.title.localeCompare(right.entry.title, "de"));
}
