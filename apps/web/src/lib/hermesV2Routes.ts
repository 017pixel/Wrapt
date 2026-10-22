/**
 * Pfade und Helfer der eigenen Hermes-V2-Featurefläche.
 *
 * Registrierte Routen-Pfade enthalten keinen Basename; der BrowserRouter setzt
 * `/wrapt` bereits voraus. Nur Links, die ein eigenes Browserfenster öffnen,
 * brauchen deshalb eine vollständige URL und nehmen den Basispfad explizit mit.
 */
export const HERMES_V2_PATH = "/hermes-v2";
export const HERMES_V2_STANDALONE_PATH = "/hermes-v2/standalone";
export const HERMES_CLASSIC_PATH = "/hermes-agent";

/**
 * Klassischer Einstieg per Deep-Link. `?ui=classic` hat Vorrang vor dem Flag
 * und übernimmt eine Session-ID URL-kodiert, damit gespeicherte IDs mit
 * Schrägstrich (z. B. "ordner/id") unverändert ankommen.
 */
export function hermesV2ClassicHref(sessionId?: string | null): string {
  const params = new URLSearchParams({ ui: "classic" });
  if (sessionId) params.set("session", sessionId);
  return `${HERMES_CLASSIC_PATH}?${params.toString()}`;
}

/**
 * Vollständige URL der Fokussierten-Oberfläche für neue Fenster. Die
 * Basis-URL darf ohne abschließenden Schrägstrich konfiguriert sein, deshalb
 * wird sie vor dem Auflösen ergänzt; ohne Fensterverhalten bleibt der reine
 * Router-Pfad. Eine übergebene Session-ID wird URL-kodiert mitgenommen, damit
 * das neue Fenster dieselbe Sitzung öffnet.
 */
export function hermesV2StandaloneHref(
  sessionId?: string | null,
  origin: string | undefined = typeof window === "undefined" ? undefined : window.location.origin,
): string {
  const base = resolveBase();
  const suffix = sessionId
    ? `?session=${encodeURIComponent(sessionId)}`
    : "";
  if (!origin) {
    // Umgebung ohne echten Ursprung (Tests, nicht im Browser) bekommt den
    // Pfad unter dem konfigurierten Basispfad.
    return `${base}${HERMES_V2_STANDALONE_PATH.replace(/^\//, "")}${suffix}`;
  }
  const resolved = new URL(base, origin);
  const href = new URL(HERMES_V2_STANDALONE_PATH.replace(/^\//, ""), resolved);
  if (sessionId) href.searchParams.set("session", sessionId);
  return href.toString();
}

function resolveBase(): string {
  const baseUrl = import.meta.env.BASE_URL;
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
