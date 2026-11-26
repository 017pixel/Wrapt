/** Serialisiert alle Mutationen je Session: Create, Attach-Recovery, Restart
 *  und Close laufen nie gleichzeitig auf derselben Sitzung. */
export class SessionMutations {
  private readonly pending = new Map<string, Promise<unknown>>();

  run<T>(sessionId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(sessionId) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(action);
    this.pending.set(sessionId, operation);
    void operation
      .finally(() => { if (this.pending.get(sessionId) === operation) this.pending.delete(sessionId); })
      .catch(() => {});
    return operation;
  }

  /** Wartet auf alle laufenden Mutationen, ohne neue Fehler zu erzeugen. */
  async settle(): Promise<void> {
    await Promise.allSettled([...this.pending.values()]);
  }
}
