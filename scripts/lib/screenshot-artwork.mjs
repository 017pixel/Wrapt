// Dashboard-Hintergrund für Screenshot-Kontexte: Das Easter-Egg-Motiv steht
// im localStorage, ein frischer Browser-Kontext kennt es nicht. Nachthimmel
// passt zum dunklen Standard-Theme.
export const SCREENSHOT_ARTWORK_ID = "nachthimmel-baum";

export async function seedDashboardArtwork(context, artworkId = SCREENSHOT_ARTWORK_ID) {
  // Der Schlüssel steht absichtlich direkt im Skript: Der Browser sieht keine
  // Closure-Variablen, nur übergebene Argumente.
  await context.addInitScript((motiv) => {
    try {
      globalThis.window.localStorage.setItem(
        "wrapt.dashboard-preferences.v1",
        JSON.stringify({ state: { hiddenSections: [], artworkEnabled: true, artworkId: motiv }, version: 2 }),
      );
    } catch {
      // Speicher gesperrt: Dann entstehen die Bilder ohne Hintergrund.
    }
  }, artworkId);
}
