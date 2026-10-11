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
 *
 * Fehler eines Zweigs sind über `limitsError`/`analyticsError` (Meldung plus
 * Alter) und feinere Unterzweig-Fehler über `branchErrors` sichtbar (D-014),
 * statt still verworfen zu werden.
 */
export interface UsageSyncBranchError {
  message: string;
  at: string;
}

export interface UsageSyncBranchErrorCounts {
  count: number;
  lastMessage: string;
  lastAt: string;
}

export interface UsageSyncStatusSnapshot {
  running: boolean;
  liveRunning: boolean;
  lastCompletedAt: string | null;
  limitsError: UsageSyncBranchError | null;
  analyticsError: UsageSyncBranchError | null;
  branchErrors: Record<string, UsageSyncBranchErrorCounts>;
}

function toBranchError(error: unknown): UsageSyncBranchError {
  const message = error instanceof Error ? error.message : "Unbekannter Sync-Fehler";
  return { message: message.slice(0, 500), at: new Date().toISOString() };
}

export class UsageSyncCoordinator {
  private running = false;
  private limitsRunning = false;
  private lastCompletedAt: string | null = null;
  private limitsError: UsageSyncBranchError | null = null;
  private analyticsError: UsageSyncBranchError | null = null;

  constructor(private readonly options: {
    refreshLimits: () => Promise<void>;
    refreshAnalytics: () => Promise<void>;
    collectBranchErrors?: () => Record<string, UsageSyncBranchErrorCounts>;
  }) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.limitsRunning = true;
    const limits = (async () => {
      try {
        await this.options.refreshLimits();
        this.limitsError = null;
      } catch (error) {
        this.limitsError = toBranchError(error);
      } finally {
        this.limitsRunning = false;
      }
    })();
    const analytics = (async () => {
      try {
        await this.options.refreshAnalytics();
        this.analyticsError = null;
      } catch (error) {
        this.analyticsError = toBranchError(error);
      }
    })();
    void Promise.allSettled([limits, analytics]).finally(() => {
      this.running = false;
      this.lastCompletedAt = new Date().toISOString();
    });
  }

  status(): UsageSyncStatusSnapshot {
    return {
      running: this.running,
      liveRunning: this.limitsRunning,
      lastCompletedAt: this.lastCompletedAt,
      limitsError: this.limitsError,
      analyticsError: this.analyticsError,
      branchErrors: this.options.collectBranchErrors?.() ?? {},
    };
  }
}
