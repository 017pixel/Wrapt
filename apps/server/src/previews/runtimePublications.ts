export interface PreviewRuntimePublication {
  url: string;
  sessionId: string;
}

/** Veröffentlichungen leben unabhängig von den beaufsichtigten Devserver-Prozessen. */
export class PreviewRuntimePublications {
  private readonly values = new Map<string, PreviewRuntimePublication>();
  private readonly heartbeat = new Map<string, number>();
  private readonly pending = new Map<string, Set<Promise<PreviewRuntimePublication>>>();
  private readonly releases = new Map<string, number>();

  get(key: string): PreviewRuntimePublication | undefined { return this.values.get(key); }
  age(key: string): number { return Date.now() - (this.heartbeat.get(key) ?? 0); }
  revision(key: string): number { return this.releases.get(key) ?? 0; }
  revoke(key: string): void { this.releases.set(key, this.revision(key) + 1); }

  async forget(key: string): Promise<void> {
    await Promise.allSettled(this.pending.get(key) ?? []);
    this.values.delete(key);
    this.heartbeat.delete(key);
  }

  async publish(key: string, create: () => Promise<PreviewRuntimePublication>, force: boolean): Promise<PreviewRuntimePublication | null> {
    if (!force && this.age(key) < 9 * 60_000) return this.get(key) ?? null;
    const request = create();
    const requests = this.pending.get(key) ?? new Set<Promise<PreviewRuntimePublication>>();
    requests.add(request);
    this.pending.set(key, requests);
    try {
      const publication = await request;
      this.values.set(key, publication);
      this.heartbeat.set(key, Date.now());
      return publication;
    } finally {
      requests.delete(request);
      if (!requests.size) this.pending.delete(key);
    }
  }
}
