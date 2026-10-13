interface Source { host: string; databasePath: string }
interface State {
  pending?: Promise<void> | undefined;
  nextAt: number;
  failures: number;
}

export function remoteT3SourceKey(source: Source): string { return `${source.host}\u0000${source.databasePath}`; }

/** Pro Quelle ein Read; die FIFO-Queue begrenzt gleichzeitige SSH-Prozesse. */
export class RemoteT3PollScheduler {
  private readonly abort = new AbortController();
  private readonly states = new Map<string, State>();
  private readonly queue: Array<() => Promise<void>> = [];
  private running = 0;

  constructor(private readonly intervalMilliseconds: number, private readonly concurrency: number,
    private readonly maximumBackoffMilliseconds: number, private readonly random = Math.random) {}

  run<T extends Source>(sources: readonly T[], read: (source: T, signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.abort.signal.aborted) return Promise.resolve();
    const work = sources.map((source) => {
      const key = remoteT3SourceKey(source);
      const state = this.states.get(key) ?? { nextAt: 0, failures: 0 };
      this.states.set(key, state);
      if (state.pending) return state.pending;
      if (Date.now() < state.nextAt) return Promise.resolve();
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => { finish = resolve; });
      state.pending = pending;
      this.queue.push(async () => {
        const startedAt = Date.now();
        try {
          if (this.abort.signal.aborted) return;
          await read(source, this.abort.signal);
          state.failures = 0;
          // Schnelle Reads behalten den bisherigen Starttakt, statt jeden zweiten Tick auszulassen.
          state.nextAt = startedAt + this.intervalMilliseconds;
        } catch {
          state.failures = Math.min(state.failures + 1, 16);
          const delay = this.intervalMilliseconds * 2 ** state.failures * (0.75 + this.random() * 0.5);
          state.nextAt = Date.now() + Math.min(this.maximumBackoffMilliseconds, delay);
        } finally {
          state.pending = undefined;
          finish();
        }
      });
      return pending;
    });
    this.pump();
    return Promise.all(work).then(() => {});
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const read = this.queue.shift()!;
      this.running += 1;
      void read().finally(() => { this.running -= 1; this.pump(); });
    }
  }

  async stop(): Promise<void> {
    this.abort.abort();
    this.pump();
    await Promise.all([...this.states.values()].map((state) => state.pending));
  }
}
