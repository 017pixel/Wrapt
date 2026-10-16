import changelogSky from "../assets/changelog/changelog-night-sky-surface.webp";
import usageSky from "../assets/dashboard-artwork/hero-notizen-nutzung-surface.webp";
import { preloadArtwork } from "./artworkPreload";

/**
 * Wärmt nur das angefragte Kopf-Motiv bei PointerEnter oder Fokus vor. Einmal pro Bild und
 * mit niedriger Priorität; fehlgeschlagene Downloads dürfen erneut versuchen.
 */
export function preloadStatusArtwork(card: "changelog" | "usage"): void {
  preloadArtwork(card === "changelog" ? changelogSky : usageSky);
}
