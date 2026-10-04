import { z } from "zod";

/** Serverpfade behalten ihr Format, unabhängig vom Betriebssystem des Browsers. */
export function isAbsoluteFilesystemPath(value: string): boolean {
  if (value.includes("\0")) return false;
  return value.startsWith("/") || /^[a-z]:[\\/]/i.test(value) || /^\\\\[^\\/]+\\[^\\/]+(?:\\|$)/.test(value);
}

export const absoluteFilesystemPathSchema = z.string().refine(isAbsoluteFilesystemPath, "Ein absoluter Dateisystempfad ist erforderlich.");

/** OSC 7 verwendet file-URLs, OSC 9;9 auch zitierte native Windows-Pfade. */
export function terminalCwdFromOsc(identifier: 7 | 9, value: string): string | null {
  try {
    let path: string;
    if (identifier === 7) {
      const url = new URL(value);
      if (url.protocol !== "file:") return null;
      path = decodeURIComponent(url.pathname);
      if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
    } else {
      if (!value.startsWith("9;")) return null;
      path = value.slice(2);
      if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
    }
    return isAbsoluteFilesystemPath(path) ? path : null;
  } catch { return null; }
}
