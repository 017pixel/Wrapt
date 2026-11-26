import type { SupervisorSession } from "./TmuxSupervisor.js";

/**
 * Single-Flight-Cache für den tmux-Scan. Jeder Scan startet einen Prozess;
 * bei einem 3-Sekunden-Poll reicht ein kurzer Cache. Fachliche Mutationen
 * rufen `clear()`.
 */
export class SupervisorSessionCache {
  private value: { at: number; promise: Promise<SupervisorSession[]> } | null = null;

  constructor(
    private readonly load: () => Promise<SupervisorSession[]>,
    private readonly ttlMilliseconds = 3_000,
  ) {}

  get(force = false): Promise<SupervisorSession[]> {
    const cached = this.value;
    if (!force && cached && Date.now() - cached.at < this.ttlMilliseconds) return cached.promise;
    const promise = this.load();
    this.value = { at: Date.now(), promise };
    void promise.catch(() => { if (this.value?.promise === promise) this.value = null; });
    return promise;
  }

  clear(): void { this.value = null; }
}
