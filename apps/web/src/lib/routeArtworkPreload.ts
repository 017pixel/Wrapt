import notesArtwork from "../assets/dashboard-artwork/hero-notizen-nutzung-surface.webp";
import projectsArtwork from "../assets/dashboard-artwork/hero-arbeitsbereich-surface.webp";
import projectArtwork from "../assets/dashboard-artwork/hero-fehlerdiagnose-surface.webp";
import toolArtwork from "../assets/dashboard-artwork/hero-konfigurieren-surface.webp";
import { preloadArtwork } from "./artworkPreload";
import { preloadDashboardArtwork } from "./dashboardArtworkPreload";

/** Vorladen folgt der Hover-/Fokus-Absicht, nie einem pauschalen Motivdownload. */
export function preloadRouteArtwork(pathname: string): void {
  if (pathname === "/") preloadDashboardArtwork(undefined, "low");
  else if (pathname === "/projects") preloadArtwork(projectsArtwork);
  else if (pathname.startsWith("/projects/")) preloadArtwork(projectArtwork);
  else if (pathname === "/notizen") preloadArtwork(notesArtwork);
  else if (pathname === "/t3-code" || pathname === "/code-editor") preloadArtwork(toolArtwork);
}
