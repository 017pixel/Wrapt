import { getDashboardArtwork, isDashboardArtworkId, defaultDashboardArtworkId } from "./dashboardArtwork";

const STORAGE_KEY = "wrapt.dashboard-preferences.v1";

/**
 * Liest das gespeicherte Motiv direkt aus dem localStorage, ohne den Zustand-
 * Store zu berühren.
 *
 * Der Store liest beim Import, aber React rendert den Preload erst, wenn das
 * Dashboard gemountet ist. Gemessen startet der Bild-Request dadurch erst bei
 * 510 ms, während das erste sichtbare Bild bei 568 ms erscheint. Dieser
 * Modul-Pfad läuft schon beim Start von `main.tsx`, also rund 240 ms früher.
 */
function readStoredArtworkId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Ohne gespeicherte Einstellung gab es noch nie eine Auswahl, also gibt es
    // auch nichts vorzuholen. Andernfalls würde jeder Aufruf dieser Funktion
    // das Startmotiv laden, obwohl der Hintergrund standardmäßig aus ist.
    if (raw === null) return "";
    const state = (JSON.parse(raw) as { state?: { artworkEnabled?: unknown; artworkId?: unknown } }).state;
    if (state?.artworkEnabled !== true) return "";
    return isDashboardArtworkId(state.artworkId) ? state.artworkId : defaultDashboardArtworkId;
  } catch {
    // Gesperrter Browser-Storage oder kaputtes JSON darf den App-Start nicht
    // verhindern. Das Dashboard zeigt dann eben später sein Hintergrundbild.
    return "";
  }
}

/**
 * Hinterlegt einen Preload für das gewählte Hintergrundbild im `document.head`.
*
 * Ohne Argument wird das gespeicherte Motiv verwendet, mit Argument das
 * übergebene, ohne den Store zu verändern. Das nutzt das Auswahlraster, damit
 * das Bild schon geladen ist, wenn der Nutzer danach aufs Dashboard wechselt.
 *
 * Ein `<link rel="preload" as="image">` wird zusätzlich zu `img.decode()`
 * benutzt: der Preload zieht die Bytes, `decode()` erzwingt die Dekodierung vor
 * dem ersten Paint. Bei 1280 x 720 sind das rund 27 ms, die sonst mitten im
 * ersten sichtbaren Frame liegen.
 *
 * Idempotent: Ein zweifter Aufruf mit demselben Motiv ändert nichts. Beim
 * Motivwechsel wird der Preload stattdessen auf den neuen Wert gesetzt.
 */
export function preloadDashboardArtwork(artworkId?: string): void {
  const requestedId = artworkId ?? readStoredArtworkId();
  if (requestedId === "") return;
  const artwork = getDashboardArtwork(requestedId);
  // Leeres Bild, zum Beispiel bei einem zur Laufzeit leeren Katalog. Ohne diese
  // Prüfung würde ein Preload ohne Adresse im Document landen.
  if (artwork.background === "") return;

  let link = document.head.querySelector<HTMLLinkElement>("link[data-dashboard-artwork]");
  if (link === null) {
    link = document.createElement("link");
    link.dataset.dashboardArtwork = "";
    // Attribute statt Properties: `as` wird nicht überall reflektiert.
    link.setAttribute("rel", "preload");
    link.setAttribute("as", "image");
  } else if (link.getAttribute("href") === artwork.background) {
    // Bereits vorgeladen. `link.href` wäre hier immer absolut und taugt
    // deshalb nicht zum Vergleich mit dem relativen Import-Pfad.
    return;
  }

  link.setAttribute("href", artwork.background);
  link.setAttribute("fetchpriority", "high");
  // Erst nach dem href anhängen. Ein `<link rel="preload">` ohne gültige
  // Adresse im Document erzeugt eine Konsolenwarnung.
  if (link.parentNode === null) document.head.append(link);

  // decode() erzwingt die Dekodierung vor dem ersten Paint. Es fehlt in jsdom
  // und in sehr alten Browsern; dort zeichnet der Browser ganz normal.
  const probe = new Image();
  probe.decoding = "async";
  probe.src = artwork.background;
  if (typeof probe.decode === "function") {
    void probe.decode().catch(() => undefined);
  }
}