/** Nur der Verlust des Workbench-Zugriffs sperrt alle Anfragen.
 * Fehlende Rechte auf einzelne Verwaltungsfunktionen bleiben lokal. */
let failure: Error | null = null;
const listeners = new Set<() => void>();

export const workbenchAccess = {
  getSnapshot: () => failure,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  report(error: Error & { status: number; code: string }) {
    if (error.status !== 401 && !(error.status === 403 && error.code === "WRAPT_FORBIDDEN")) return;
    if (failure) return;
    failure = error;
    for (const listener of listeners) listener();
  },
  reset() {
    failure = null;
    for (const listener of listeners) listener();
  },
  assertAllowed() { if (failure) throw failure; },
};
