export const OVERLAY_TRANSPARENCY_STORAGE_KEY = "wrapt:overlay-transparency:v1";
export const DEFAULT_OVERLAY_TRANSPARENCY = 100;

const changeEvent = "wrapt:overlay-transparency-change";

export function normalizeOverlayTransparency(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(300, Math.max(0, Math.round(value)))
    : DEFAULT_OVERLAY_TRANSPARENCY;
}

function parseSavedTransparency(value: string | null): number {
  try {
    return value === null ? DEFAULT_OVERLAY_TRANSPARENCY : normalizeOverlayTransparency(JSON.parse(value));
  } catch {
    return DEFAULT_OVERLAY_TRANSPARENCY;
  }
}

export function readOverlayTransparency(storage?: Pick<Storage, "getItem">): number {
  try {
    const source = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    return parseSavedTransparency(source?.getItem(OVERLAY_TRANSPARENCY_STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_OVERLAY_TRANSPARENCY;
  }
}

export function applyOverlayTransparency(value: number): void {
  if (typeof document === "undefined") return;
  const intensity = normalizeOverlayTransparency(value);
  // Das Material bleibt in den Theme-Tokens; der Regler steuert nur die
  // Intensität. Damit folgen Durchsicht und Unschärfe derselben Auswahl.
  document.documentElement.style.setProperty("--glass-intensity", String(intensity / 100));
}

export function writeOverlayTransparency(value: number, storage?: Pick<Storage, "setItem">): number {
  const intensity = normalizeOverlayTransparency(value);
  try {
    const destination = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    destination?.setItem(OVERLAY_TRANSPARENCY_STORAGE_KEY, JSON.stringify(intensity));
  } catch {
    // Die Live-Einstellung bleibt nutzbar, wenn der Browser lokalen Speicher sperrt.
  }
  applyOverlayTransparency(intensity);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(changeEvent, { detail: intensity }));
  return intensity;
}

export function subscribeOverlayTransparency(listener: (intensity: number) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = (event: Event) => listener(normalizeOverlayTransparency((event as CustomEvent<unknown>).detail));
  const onStorage = (event: StorageEvent) => {
    if (event.key !== OVERLAY_TRANSPARENCY_STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea !== null && event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    listener(parseSavedTransparency(event.newValue));
  };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function initializeOverlayTransparency(): () => void {
  applyOverlayTransparency(readOverlayTransparency());
  return subscribeOverlayTransparency(applyOverlayTransparency);
}
