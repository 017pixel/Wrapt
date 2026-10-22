import type { HermesV2ResourceText } from "@wrapt/contracts/hermes-v2";

/**
 * Reine Anzeigetexte der Skills-/Memory-/Pending-Flächen: Herkunfts- und
 * Statuswörter bleiben so unbestimmt, wie der native Beleg es hergibt.
 */

export function provenanceLabel(provenance: string): string {
  switch (provenance) {
    case "hub": return "Hub";
    case "bundled": return "Mitgeliefert";
    case "external": return "Extern";
    case "agent": return "Agent";
    default: return "Herkunft unbekannt";
  }
}

export function enabledLabel(enabled: boolean | null): string {
  if (enabled === null) return "Aktivstatus unbekannt";
  return enabled ? "Aktiv" : "Deaktiviert";
}

export function slashLabel(slashCommand: string | null): string {
  return slashCommand ? `Slash: /${slashCommand}` : "Keine belegte Slashzuordnung";
}

export function subsystemLabel(subsystem: string): string {
  return subsystem === "memory" ? "Memory" : "Skills";
}

export function originLabel(origin: string | null): string {
  if (origin === null) return "Herkunft unbekannt";
  return origin === "foreground" ? "Aus Vordergrund" : "Aus Hintergrundprüfung";
}

export function epochText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "unbekannt";
  try {
    return new Date(value).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

/** Ehrliche Textzustände inklusive Kürzung; Daten bleiben reiner Text. */
export function textStatusNote(text: HermesV2ResourceText | null): string | null {
  if (!text) return null;
  const note: Record<HermesV2ResourceText["status"], string | null> = {
    available: null,
    empty: "Inhalt ist leer.",
    missing: "Inhalt fehlt nativ.",
    unreadable: "Inhalt ist aktuell unlesbar.",
    unknown: "Inhalt ist nativ unbekannt.",
  };
  return note[text.status];
}
