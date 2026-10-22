/** Operationen derselben Session bleiben geordnet, verschiedene Sessions unabhängig. */
export class SessionOperationQueue {
  private readonly queues = new Map<string, Promise<unknown>>();

  async serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const before = this.queues.get(key) ?? Promise.resolve();
    const next = before.catch(() => undefined).then(operation);
    this.queues.set(key, next);
    try { return await next; }
    finally { if (this.queues.get(key) === next) this.queues.delete(key); }
  }
}
