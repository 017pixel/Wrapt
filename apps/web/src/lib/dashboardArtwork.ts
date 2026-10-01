import arbeitsbereich from "../../../../docs-webseite/assets/hero-arbeitsbereich.webp";
import architektur from "../../../../docs-webseite/assets/hero-architektur.webp";
import changelog from "../../../../docs-webseite/assets/hero-changelog.webp";
import fehlerdiagnose from "../../../../docs-webseite/assets/hero-fehlerdiagnose.webp";
import installation from "../../../../docs-webseite/assets/hero-installation.webp";
import konfigurieren from "../../../../docs-webseite/assets/hero-konfigurieren.webp";
import migration from "../../../../docs-webseite/assets/hero-migration.webp";
import mitarbeiten from "../../../../docs-webseite/assets/hero-mitarbeiten.webp";
import notizenNutzung from "../../../../docs-webseite/assets/hero-notizen-nutzung.webp";
import openSource from "../../../../docs-webseite/assets/hero-open-source.webp";
import orbit from "../../../../docs-webseite/assets/hero-orbit.webp";
import pluginsExtensions from "../../../../docs-webseite/assets/hero-plugins-extensions.webp";
import previews from "../../../../docs-webseite/assets/hero-previews.webp";
import sichern from "../../../../docs-webseite/assets/hero-sichern.webp";
import terminal from "../../../../docs-webseite/assets/hero-terminal.webp";
import ueberWrapt from "../../../../docs-webseite/assets/hero-ueber-wrapt.webp";
import werkzeuge from "../../../../docs-webseite/assets/hero-werkzeuge.webp";
import zugriffSicherheit from "../../../../docs-webseite/assets/hero-zugriff-sicherheit.webp";
import nachthimmel from "../../../../docs-webseite/assets/nachthimmel-baum.webp";

export const dashboardArtworks = [
  { id: "nachthimmel-baum", label: "Nachthimmel", src: nachthimmel },
  { id: "hero-arbeitsbereich", label: "Arbeitsbereich", src: arbeitsbereich },
  { id: "hero-architektur", label: "Architektur", src: architektur },
  { id: "hero-changelog", label: "Changelog", src: changelog },
  { id: "hero-fehlerdiagnose", label: "Fehlerdiagnose", src: fehlerdiagnose },
  { id: "hero-installation", label: "Installation", src: installation },
  { id: "hero-konfigurieren", label: "Konfigurieren", src: konfigurieren },
  { id: "hero-migration", label: "Migration", src: migration },
  { id: "hero-mitarbeiten", label: "Mitarbeit", src: mitarbeiten },
  { id: "hero-notizen-nutzung", label: "Notizen", src: notizenNutzung },
  { id: "hero-open-source", label: "Open Source", src: openSource },
  { id: "hero-orbit", label: "Orbit", src: orbit },
  { id: "hero-plugins-extensions", label: "Plugins", src: pluginsExtensions },
  { id: "hero-previews", label: "Previews", src: previews },
  { id: "hero-sichern", label: "Sichern", src: sichern },
  { id: "hero-terminal", label: "Terminal", src: terminal },
  { id: "hero-ueber-wrapt", label: "Über Wrapt", src: ueberWrapt },
  { id: "hero-werkzeuge", label: "Werkzeuge", src: werkzeuge },
  { id: "hero-zugriff-sicherheit", label: "Zugriff & Sicherheit", src: zugriffSicherheit },
] as const;

export type DashboardArtworkId = (typeof dashboardArtworks)[number]["id"];

export const defaultDashboardArtworkId: DashboardArtworkId = "nachthimmel-baum";

export function isDashboardArtworkId(value: unknown): value is DashboardArtworkId {
  return dashboardArtworks.some((artwork) => artwork.id === value);
}

export function getDashboardArtwork(value: unknown) {
  const id = isDashboardArtworkId(value) ? value : defaultDashboardArtworkId;
  return dashboardArtworks.find((artwork) => artwork.id === id)!;
}
