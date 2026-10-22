import type { ResourceArea } from "./resource-types";

/**
 * Oberflächenlokale Bereichsliste der nativen Ressourcenfläche. Reine
 * Layoutangaben und Labels; Fachtypen kommen vom Clientvertrag.
 * Der Bereichszustand lebt in der Surface, es gibt keine Ressourcen-URL.
 */
export const RESOURCE_AREA_IDS = [
  "chat",
  "cron",
  "skills",
  "memory",
  "configuration",
  "diagnostics",
  "session-delete",
] as const;

export type ChatOrResourceArea = (typeof RESOURCE_AREA_IDS)[number];
export type SidebarArea = Exclude<ChatOrResourceArea, ResourceArea>;
export type SelectableArea = Exclude<ChatOrResourceArea, "session-delete">;

/** Sichtbare Auswahlliste: die Deletefläche wird nur über den Menübefehl geöffnet. */
export const SELECTABLE_AREAS: readonly SelectableArea[] = [
  "chat",
  "cron",
  "skills",
  "memory",
  "configuration",
  "diagnostics",
];

export interface ResourceAreaMeta {
  id: SelectableArea;
  label: string;
  /** Stabile Bereichskurzform für Marker und Markerattribute. */
  marker: string;
}

export const AREA_META: readonly ResourceAreaMeta[] = [
  { id: "chat", label: "Chat", marker: "chat" },
  { id: "cron", label: "Cron", marker: "cron" },
  { id: "skills", label: "Skills", marker: "skills" },
  { id: "memory", label: "Memory", marker: "memory" },
  { id: "configuration", label: "Konfiguration", marker: "configuration" },
  { id: "diagnostics", label: "Diagnose", marker: "diagnostics" },
];

export function isSelectableArea(value: string): value is SelectableArea {
  return SELECTABLE_AREAS.some((area) => area === value);
}

/**
 * Sichtbare Lesefläche: eigener Bereich gewählt, Rahmen aktiv, nichts liegt
 * darüber. Flag und Dokumentvisibility prüft der Clienthook selbst; hier
 * entsteht nur der Oberflächenschalter ohne DOM, testbar ohne Rendern.
 */
export function resourceReadActive(options: {
  frameActive: boolean;
  drawerOverlay: boolean;
  dialogOpen: boolean;
}): boolean {
  return options.frameActive && !options.drawerOverlay && !options.dialogOpen;
}

/** Regulärer Zielbereich beim Zurückkehren aus der Deletefläche. */
export const DEFAULT_AREA: SelectableArea = "chat";
