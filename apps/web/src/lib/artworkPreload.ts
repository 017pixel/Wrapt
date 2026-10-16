const warmedArtwork = new Map<string, HTMLImageElement>();

/** Lädt ein konkret angefragtes Motiv einmal vor, ohne die Bedienung zu blockieren. */
export function preloadArtwork(src: string): void {
  const connection = typeof navigator === "undefined" ? undefined
    : (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (src === "" || warmedArtwork.has(src) || connection?.saveData === true) return;
  try {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.onerror = () => warmedArtwork.delete(src);
    warmedArtwork.set(src, image);
    image.src = src;
    if (typeof image.decode === "function") void image.decode().catch(() => warmedArtwork.delete(src));
  } catch {
    warmedArtwork.delete(src);
    // Fehlende Browser-APIs oder ein kaputtes Bild dürfen Hover nie blockieren.
  }
}
