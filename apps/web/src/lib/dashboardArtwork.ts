import nachthimmelBaumBg from "../assets/dashboard-artwork/nachthimmel-baum-bg.webp";
import nachthimmelBaumThumb from "../assets/dashboard-artwork/nachthimmel-baum-thumb.webp";
import heroArbeitsbereichBg from "../assets/dashboard-artwork/hero-arbeitsbereich-bg.webp";
import heroArbeitsbereichThumb from "../assets/dashboard-artwork/hero-arbeitsbereich-thumb.webp";
import heroArchitekturBg from "../assets/dashboard-artwork/hero-architektur-bg.webp";
import heroArchitekturThumb from "../assets/dashboard-artwork/hero-architektur-thumb.webp";
import heroChangelogBg from "../assets/dashboard-artwork/hero-changelog-bg.webp";
import heroChangelogThumb from "../assets/dashboard-artwork/hero-changelog-thumb.webp";
import heroFehlerdiagnoseBg from "../assets/dashboard-artwork/hero-fehlerdiagnose-bg.webp";
import heroFehlerdiagnoseThumb from "../assets/dashboard-artwork/hero-fehlerdiagnose-thumb.webp";
import heroInstallationBg from "../assets/dashboard-artwork/hero-installation-bg.webp";
import heroInstallationThumb from "../assets/dashboard-artwork/hero-installation-thumb.webp";
import heroKonfigurierenBg from "../assets/dashboard-artwork/hero-konfigurieren-bg.webp";
import heroKonfigurierenThumb from "../assets/dashboard-artwork/hero-konfigurieren-thumb.webp";
import heroMigrationBg from "../assets/dashboard-artwork/hero-migration-bg.webp";
import heroMigrationThumb from "../assets/dashboard-artwork/hero-migration-thumb.webp";
import heroMitarbeitenBg from "../assets/dashboard-artwork/hero-mitarbeiten-bg.webp";
import heroMitarbeitenThumb from "../assets/dashboard-artwork/hero-mitarbeiten-thumb.webp";
import heroNotizenNutzungBg from "../assets/dashboard-artwork/hero-notizen-nutzung-bg.webp";
import heroNotizenNutzungThumb from "../assets/dashboard-artwork/hero-notizen-nutzung-thumb.webp";
import heroOpenSourceBg from "../assets/dashboard-artwork/hero-open-source-bg.webp";
import heroOpenSourceThumb from "../assets/dashboard-artwork/hero-open-source-thumb.webp";
import heroOrbitBg from "../assets/dashboard-artwork/hero-orbit-bg.webp";
import heroOrbitThumb from "../assets/dashboard-artwork/hero-orbit-thumb.webp";
import heroPluginsExtensionsBg from "../assets/dashboard-artwork/hero-plugins-extensions-bg.webp";
import heroPluginsExtensionsThumb from "../assets/dashboard-artwork/hero-plugins-extensions-thumb.webp";
import heroPreviewsBg from "../assets/dashboard-artwork/hero-previews-bg.webp";
import heroPreviewsThumb from "../assets/dashboard-artwork/hero-previews-thumb.webp";
import heroSichernBg from "../assets/dashboard-artwork/hero-sichern-bg.webp";
import heroSichernThumb from "../assets/dashboard-artwork/hero-sichern-thumb.webp";
import heroTerminalBg from "../assets/dashboard-artwork/hero-terminal-bg.webp";
import heroTerminalThumb from "../assets/dashboard-artwork/hero-terminal-thumb.webp";
import heroUeberWraptBg from "../assets/dashboard-artwork/hero-ueber-wrapt-bg.webp";
import heroUeberWraptThumb from "../assets/dashboard-artwork/hero-ueber-wrapt-thumb.webp";
import heroWerkzeugeBg from "../assets/dashboard-artwork/hero-werkzeuge-bg.webp";
import heroWerkzeugeThumb from "../assets/dashboard-artwork/hero-werkzeuge-thumb.webp";
import heroZugriffSicherheitBg from "../assets/dashboard-artwork/hero-zugriff-sicherheit-bg.webp";
import heroZugriffSicherheitThumb from "../assets/dashboard-artwork/hero-zugriff-sicherheit-thumb.webp";

/**
 * Motiv-Katalog für den Dashboard-Hintergrund.
 *
 * Die Motive stammen aus den Hero-Grafiken der Dokumentationsseite, liegen
 * aber als eigene, kleinere Varianten unter `src/assets/dashboard-artwork`.
 * Erzeugt werden sie von `scripts/generate-dashboard-artwork-variants.py`:
 *
 * - `background` (1280 x 720, rund 60 KB) für den Vollbild-Hintergrund. Der
 *   wird auf 100vh gedehnt, mit `brightness(.42)` abgedunkelt und mit
 *   `blur(1px)` weichgezeichnet. Die Originalauflösung 1672 x 941 ist da nicht
 *   sichtbar, kostet aber rund 179 KB und doppelte Dekodierzeit.
 * - `thumbnail` (320 x 180, rund 3 KB) für das Auswahlraster. Ohne diese Stufe
 *   lädt der Easter-Egg-Tab 2,7 MB Volldateien, um 19 kleine Vorschauen zu
 *   zeigen; damit sind es 59 KB.
 *
 * Die Originale in `docs-webseite/assets` bleiben unangetastet, weil die
 * Dokumentationsseite sie in voller Auflösung als Hero-Bilder braucht.
 */
export interface DashboardArtwork {
  readonly id: string;
  readonly label: string;
  /** 1280 x 720 für den Hintergrundlayer auf dem Dashboard. */
  readonly background: string;
  /** 320 x 180 für die Auswahlvorschau in den Einstellungen. */
  readonly thumbnail: string;
}

export const dashboardArtworks: readonly DashboardArtwork[] = [
  { id: "nachthimmel-baum", label: "Nachthimmel", background: nachthimmelBaumBg, thumbnail: nachthimmelBaumThumb },
  { id: "hero-arbeitsbereich", label: "Arbeitsbereich", background: heroArbeitsbereichBg, thumbnail: heroArbeitsbereichThumb },
  { id: "hero-architektur", label: "Architektur", background: heroArchitekturBg, thumbnail: heroArchitekturThumb },
  { id: "hero-changelog", label: "Changelog", background: heroChangelogBg, thumbnail: heroChangelogThumb },
  { id: "hero-fehlerdiagnose", label: "Fehlerdiagnose", background: heroFehlerdiagnoseBg, thumbnail: heroFehlerdiagnoseThumb },
  { id: "hero-installation", label: "Installation", background: heroInstallationBg, thumbnail: heroInstallationThumb },
  { id: "hero-konfigurieren", label: "Konfigurieren", background: heroKonfigurierenBg, thumbnail: heroKonfigurierenThumb },
  { id: "hero-migration", label: "Migration", background: heroMigrationBg, thumbnail: heroMigrationThumb },
  { id: "hero-mitarbeiten", label: "Mitarbeit", background: heroMitarbeitenBg, thumbnail: heroMitarbeitenThumb },
  { id: "hero-notizen-nutzung", label: "Notizen", background: heroNotizenNutzungBg, thumbnail: heroNotizenNutzungThumb },
  { id: "hero-open-source", label: "Open Source", background: heroOpenSourceBg, thumbnail: heroOpenSourceThumb },
  { id: "hero-orbit", label: "Orbit", background: heroOrbitBg, thumbnail: heroOrbitThumb },
  { id: "hero-plugins-extensions", label: "Plugins", background: heroPluginsExtensionsBg, thumbnail: heroPluginsExtensionsThumb },
  { id: "hero-previews", label: "Previews", background: heroPreviewsBg, thumbnail: heroPreviewsThumb },
  { id: "hero-sichern", label: "Sichern", background: heroSichernBg, thumbnail: heroSichernThumb },
  { id: "hero-terminal", label: "Terminal", background: heroTerminalBg, thumbnail: heroTerminalThumb },
  { id: "hero-ueber-wrapt", label: "Über Wrapt", background: heroUeberWraptBg, thumbnail: heroUeberWraptThumb },
  { id: "hero-werkzeuge", label: "Werkzeuge", background: heroWerkzeugeBg, thumbnail: heroWerkzeugeThumb },
  { id: "hero-zugriff-sicherheit", label: "Zugriff & Sicherheit", background: heroZugriffSicherheitBg, thumbnail: heroZugriffSicherheitThumb },
];

export type DashboardArtworkId = (typeof dashboardArtworks)[number]["id"];

export const defaultDashboardArtworkId: DashboardArtworkId = "nachthimmel-baum";

const artworkById = new Map<string, DashboardArtwork>(
  dashboardArtworks.map((artwork) => [artwork.id, artwork]),
);

export function isDashboardArtworkId(value: unknown): value is DashboardArtworkId {
  return typeof value === "string" && artworkById.has(value);
}

// Ohne Netzschutz für den Fall, dass der Katalog zur Laufzeit leer ist. Der
// Aufrufer im App-Start darf keinen TypeError werfen, sonst startet Wrapt nicht.
const fallbackArtwork: DashboardArtwork = {
  id: defaultDashboardArtworkId,
  label: "",
  background: "",
  thumbnail: "",
};

/** Liefert das Motiv und fällt bei unbekannter oder beschädigter ID auf den Startwert zurück. */
export function getDashboardArtwork(value: unknown): DashboardArtwork {
  const id = isDashboardArtworkId(value) ? value : defaultDashboardArtworkId;
  return artworkById.get(id) ?? artworkById.get(defaultDashboardArtworkId) ?? fallbackArtwork;
}