import type { SidebarRowView, SidebarShelf } from "./sidebar-types";

/**
 * Die Hauptliste folgt Eingabe nötig und zeigt die zuletzt benutzten Chats.
 * Sie trägt bewusst keinen
 * Namen mehr: "Aktiv" beschrieb keinen Zustand, sondern nur die Nutzung.
 */
export const MAIN_LIST_SHELF = "active" satisfies SidebarShelf;

/** Fachliche Beschriftung der Shelfs, deutsch und ohne Zusatztext. */
export const SHELF_LABELS: Record<Exclude<SidebarShelf, typeof MAIN_LIST_SHELF>, string> = {
  "needs-input": "Eingabe nötig",
  working: "In Arbeit",
  pinned: "Angeheftet",
  snoozed: "Zurückgestellt",
  settled: "Erledigt",
};

/**
 * Eingabe nötig steht vor der Hauptliste, die übrigen Shelfs im unteren Dock.
 * Die Reihenfolge entsteht in der Oberfläche; die Daten des Servers bleiben
 * unverändert.
 */
export const SHELF_ORDER: readonly SidebarShelf[] = [
  "needs-input",
  MAIN_LIST_SHELF,
  "working",
  "pinned",
  "snoozed",
  "settled",
];

/** Shelfs mit eigener Mitgliederliste im Server. */
export const MEMBER_SHELVES: readonly SidebarShelf[] = [
  "pinned",
  "snoozed",
  "settled",
];

/**
 * Shelfs, die ohne gespeicherte Voreinstellung einklappbar sind. Die übrigen
 * merken sich ihren Zustand in den Sidebar-Einstellungen.
 */
export const LOCAL_COLLAPSIBLE = ["pinned", "needs-input"] as const satisfies readonly SidebarShelf[];

/** Prüft, ob der Shelf seinen Einklappzustand lokal hält. */
export function isLocalCollapsible(id: SidebarShelf): id is (typeof LOCAL_COLLAPSIBLE)[number] {
  return (LOCAL_COLLAPSIBLE as readonly SidebarShelf[]).includes(id);
}

/** Beschriftung des Nachladeknopfes einer Mitgliederliste. */
export const SHELF_LOAD_LABELS: Partial<Record<SidebarShelf, string>> = {
  pinned: "Mehr Angeheftete laden",
  snoozed: "Mehr Zurückgestellte laden",
};

/**
 * Kompaktes Statuswort für die Meta-Zeile der Zeile. Nur dort, wo das Wort
 * mehr sagt als die Shelf-Bezeichnung: bei wartenden Sitzungen.
 */
export function statusLabel(row: SidebarRowView): string | null {
  if (row.group === "needs-input") return attentionWord(row.attentionKind);
  return null;
}

/** Ehrliche, sichtbare Statuswörter statt nur eines Punkts. */
export function statusWord(row: SidebarRowView): string {
  switch (row.group) {
    case "needs-input":
      return attentionWord(row.attentionKind);
    case "working":
      return "Arbeitet";
    case "snoozed":
      return row.snoozedUntil !== null
        ? `Rückkehr ${formatDateTime(row.snoozedUntil)}`
        : "Zurückgestellt";
    case "settled":
      return row.settledAt !== null
        ? `Erledigt ${formatDateTime(row.settledAt)}`
        : "Erledigt";
    default:
      return row.activity === "working"
        ? "Arbeitet"
        : row.activity === "unknown"
          ? "Status unbekannt"
          : "Ruhend";
  }
}

function attentionWord(kind: SidebarRowView["attentionKind"]): string {
  switch (kind) {
    case "request":
      return "Wartet auf dich";
    case "new-answer":
      return "Neue Antwort";
    case "live-turn-end":
      return "Turn beendet";
    case "decision-error":
      return "Fehler";
    case "coverage":
      return "Abgleich offen";
    default:
      return "Eingabe nötig";
  }
}

const whenFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(timestamp: number): string {
  return whenFormatter.format(new Date(timestamp));
}

/** Quelle der Sitzung: Projektordner, Projektkennung oder „Ohne Projekt". */
export function sourceLabel(row: SidebarRowView): string {
  if (row.projectId === null) return "Ohne Projekt";
  const cwd = row.cwd?.trim();
  if (cwd) {
    const name = cwd.split(/[\\/]+/).filter(Boolean).at(-1);
    if (name) return name;
  }
  return row.projectId ?? "Ohne Projekt";
}
