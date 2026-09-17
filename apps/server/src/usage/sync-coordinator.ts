/**
 * Koordiniert den Hintergrund-Sync der Nutzungsdaten.
 *
 * Der Sync besteht aus zwei unabhängigen Zweigen: den Limitdaten (Live-Abruf
 * und darauf aufbauender Zeitleiste), die für die sichtbare Limitansicht
 * relevant sind, und der Auswertung (SQLite-Import, Kosten, Projekte), die
 * deutlich länger laufen kann. `running` endet erst, wenn beide Zweige fertig
 * sind; `liveRunning` beschreibt nur den Limit-Zweig, damit die Oberfläche die
 * Limits früher aktualisieren kann. Ein laufender Sync wird nicht doppelt
 * gestartet, und Fehler eines Zweigs beenden den anderen nicht.
 */
export interface UsageSyncStatusSnapshot {
  running: boolean;
  liveRunning: boolean;
  lastCompletedAt: string | null;
}

export class UsageSyncCoordinator {
  private running = false;
  private limitsRunning = false;
  private lastCompletedAt: string | null = null;

  constructor(private readonly options: {
    refreshLimits: () => Promise<void>;
    refreshAnalytics: () => Promise<void>;
  }) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.limitsRunning = true;
    const limits = (async () => {
      try {
        await this.options.refreshLimits();
      } finally {
        this.limitsRunning = false;
      }
    })();
    void Promise.allSettled([limits, this.options.refreshAnalytics()]).finally(() => {
      this.running = false;
      this.lastCompletedAt = new Date().toISOString();
    });
  }

  status(): UsageSyncStatusSnapshot {
    return {
      running: this.running,
      liveRunning: this.limitsRunning,
      lastCompletedAt: this.lastCompletedAt,
    };
  }
}
