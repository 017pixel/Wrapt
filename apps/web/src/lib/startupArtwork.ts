import { preloadDashboardArtwork } from "./dashboardArtworkPreload";

// Muss vor dem App-Import ausgeführt werden: Das Artwork startet früh, damit es
// vor dem ersten sichtbaren Inhalt fertig ist. Die Pfadprüfung ist nötig, weil
// die Auswahl im localStorage steht und nur JS sie lesen kann.
if (["/", "/wrapt", "/wrapt/"].includes(window.location.pathname)) preloadDashboardArtwork();
