import { CAPYBARA_FRAMES, CAPYBARA_ZZZ_FRAMES, CAPYBARA_CONFETTI_FRAMES } from "./capybaraFrames";

const images = new Map<string, Promise<HTMLImageElement>>();

/** Gehashte URLs sind die Cacheversion; fehlgeschlagene Bilder bleiben wiederholbar. */
export function preloadCapybaraImage(url: string): Promise<HTMLImageElement> {
  const cached = images.get(url);
  if (cached) return cached;
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      void (image.decode?.() ?? Promise.resolve()).then(() => resolve(image), reject);
    };
    image.onerror = () => reject(new Error("Maskottchenbild konnte nicht geladen werden."));
    image.src = url;
  }).catch((error: unknown) => { if (images.get(url) === loading) images.delete(url); throw error; });
  images.set(url, loading);
  return loading;
}

export async function preloadCapybaraFrames(): Promise<void> {
  // Der Browser plant Image-Reads; das erste sichtbare Bild wurde bereits dekodiert.
  await Promise.allSettled([...new Set([
    ...Object.values(CAPYBARA_FRAMES), ...CAPYBARA_ZZZ_FRAMES, ...CAPYBARA_CONFETTI_FRAMES,
  ])].map(preloadCapybaraImage));
}
