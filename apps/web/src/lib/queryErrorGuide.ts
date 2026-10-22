// Zentrales Mapping von Abfragefehlern auf Titel + Ursache + nächsten Schritt.
// Jede Fehlerfläche (QueryBoundary, Dashboard-Panels, Preview) zeigt denselben
// Dreiklang plus Retry — statt roher Error.message ohne Lösungsweg (U-003).
import { ApiClientError } from "./apiClient/transport.js";

export type QueryErrorKind = "zugriff" | "entfernt" | "netzwerk" | "timeout" | "validierung" | "quarantaene" | "unbekannt";

export interface QueryErrorGuide {
  kind: QueryErrorKind;
  titel: string;
  ursache: string;
  aktion: string;
  /** Hinweis auf Doku/Config, z. B. preview.config.json — null wenn nicht relevant. */
  docsHinweis: string | null;
  retryable: boolean;
  requestId: string | null;
}

/** Die Backend-Korrelations-ID, falls vorhanden — zum Angeben bei Meldungen. */
export function extractRequestId(error: unknown): string | null {
  if (error instanceof ApiClientError) return error.requestId;
  return null;
}

function fehlerText(error: unknown): { text: string; name: string; code: string; status: number | null } {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  const code = error instanceof ApiClientError ? error.code : "";
  const status = error instanceof ApiClientError ? error.status : null;
  return { text: `${code} ${message}`.toLowerCase(), name: error instanceof Error ? error.name : "", code, status };
}

export function classifyQueryError(error: unknown): QueryErrorKind {
  const { text, name, status } = fehlerText(error);
  if (status === 401 || status === 403) return "zugriff";
  if (status === 404 || status === 410) return "entfernt";
  if (text.includes("quarantäne") || text.includes("quarantaene") || text.includes("quarantine")) return "quarantaene";
  if (
    name === "AbortError" || name === "TimeoutError"
    || text.includes("timeout") || text.includes("zeitüberschreitung") || text.includes("abgebrochen")
    || status === 408 || status === 504
  ) return "timeout";
  if (
    name === "ZodError" || text.includes("zod") || text.includes("validierung")
    || text.includes("erwarteten format") || text.includes("schema")
    || status === 400 || status === 422
  ) return "validierung";
  if (
    name === "TypeError" || text.includes("fetch") || text.includes("netzwerk") || text.includes("network")
    || text.includes("nicht erreichbar") || text.includes("offline") || text.includes("verbindung")
    || (status !== null && status >= 500)
  ) return "netzwerk";
  return "unbekannt";
}

export function queryErrorGuide(error: unknown, fallback: string): QueryErrorGuide {
  const kind = classifyQueryError(error);
  const ursache = error instanceof Error && error.message ? error.message : fallback;
  const requestId = extractRequestId(error);
  const retryable = error instanceof ApiClientError ? error.retryable : kind === "netzwerk" || kind === "timeout";
  switch (kind) {
    case "zugriff":
      return { kind, ursache, requestId, titel: "Zugriff nicht erlaubt", aktion: "Prüfe die Tailscale-Verbindung und die Freigabe deines Kontos für diesen Bereich.", docsHinweis: null, retryable: false };
    case "entfernt":
      return { kind, ursache, requestId, titel: "Inhalt nicht mehr verfügbar", aktion: "Öffne die Übersicht und wähle einen vorhandenen Eintrag.", docsHinweis: null, retryable: false };
    case "quarantaene":
      return {
        kind, ursache, requestId,
        titel: "Preview-Slot gesperrt (Quarantäne)",
        aktion: "Öffne die Diagnose des Previews und setze den Slot zurück. Der Reset muss verifizierbar sein, sonst bleibt der Slot gesperrt.",
        docsHinweis: "Hilfe: preview.config.json im Projekt prüfen",
        retryable: true,
      };
    case "timeout":
      return {
        kind, ursache, requestId,
        titel: "Anfrage hat zu lange gedauert",
        aktion: "Warte kurz und versuche es erneut. Bei Wiederholung: Dev-Server-Logs prüfen.",
        docsHinweis: null,
        retryable: true,
      };
    case "validierung":
      return {
        kind, ursache, requestId,
        titel: "Antwort passt nicht zum erwarteten Format",
        aktion: "Meist hilft ein erneuter Versuch nach einem Update. Tritt der Fehler dauerhaft auf, prüfe bei Preview-Projekten die preview.config.json.",
        docsHinweis: "Hilfe: preview.config.json im Projekt prüfen",
        retryable,
      };
    case "netzwerk":
      return {
        kind, ursache, requestId,
        titel: "Verbindung fehlgeschlagen",
        aktion: "Prüfe, ob das Backend läuft, und versuche es erneut. Kopiere bei Bedarf das Log für eine Meldung.",
        docsHinweis: null,
        retryable: true,
      };
    default:
      return {
        kind, ursache, requestId,
        titel: "Daten konnten nicht geladen werden",
        aktion: "Versuche es erneut.",
        docsHinweis: null,
        retryable,
      };
  }
}

/** Anzeigezeile für die Korrelations-ID („bei Meldung angeben"). */
export function formatRequestId(requestId: string | null): string | null {
  return requestId ? `Anfrage-ID: ${requestId} (bei Meldung angeben)` : null;
}
