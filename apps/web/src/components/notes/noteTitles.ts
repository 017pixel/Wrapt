/**
 * Titel neuer Seiten: „Notiz – 23.09.2026“. Vorlagen gibt es bewusst nicht
 * mehr; jede Seite startet leer.
 */
export function newNoteTitle(now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
  return `Notiz – ${date}`;
}
