/** Single-Flight-Cache für kurzlebige Statusabfragen. */
export class PreviewStatusCache<T> {
  private readonly values = new Map<string, { at: number; promise: Promise<T> }>();

  constructor(private readonly ttlMilliseconds = 1_500) {}

  get(key: string, load: () => Promise<T>, force = false): Promise<T> {
    const cached = this.values.get(key);
    if (!force && cached && Date.now() - cached.at < this.ttlMilliseconds) return cached.promise;
    const promise = load();
    this.values.set(key, { at: Date.now(), promise });
    void promise.catch(() => { if (this.values.get(key)?.promise === promise) this.values.delete(key); });
    return promise;
  }

  clear(): void { this.values.clear(); }
}
