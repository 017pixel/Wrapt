import { noteIconPath } from "./notePageIcons.js";

interface NotePageIconProps {
  /** Symbolname aus dem Katalog; unbekannt oder leer zeigt das Standard-Dokument. */
  name: string | null | undefined;
  className?: string;
  /** Erzwingt ein Symbol, etwa den Ordner für Seiten mit Unterseiten. */
  fallback?: string;
}

/** Rendert ein Material-Symbol (Rounded) als Inline-SVG in aktueller Textfarbe. */
export function NotePageIcon({ name, className, fallback = "description" }: NotePageIconProps) {
  const path = noteIconPath(name) ?? noteIconPath(fallback);
  if (path === null) return null;
  return (
    <svg viewBox="0 -960 960 960" className={className} aria-hidden focusable="false">
      <path d={path} fill="currentColor" />
    </svg>
  );
}
