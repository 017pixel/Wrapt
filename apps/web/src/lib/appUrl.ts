/**
 * Volle Seiten-Reloads brauchen den Basename der App (Vite base, z. B.
 * `/wrapt`), der Router dagegen nicht. Wer `window.location.assign` mit einer
 * basename-losen Route aufruft, landet auf der 404-Seite des Servers.
 */

/** Basename ohne Schrägstrich am Ende, z. B. `/wrapt`. */
export function appBase(): string {
  const configured = import.meta.env.BASE_URL.replace(/\/$/, "");
  // Der Basename steht fest (Vite base, statisches Prefix in static.ts). Fällt
  // die Umgebungsinjektion aus (z. B. Tests), gilt der produktive Wert.
  return configured === "" ? "/wrapt" : configured;
}

/** Volle Code-Editor-Seite mit Zielordner, inklusive Basename. */
export function codeEditorUrl(folder: string | null): string {
  const query = folder ? `?${new URLSearchParams({ folder }).toString()}` : "";
  return `${appBase()}/code-editor/${query}`;
}
