const pending = new Map<string, Promise<unknown>>();

/** Öffnen, Laufzeit-Veröffentlichen und Schließen desselben Schlüssels folgen aufeinander. */
export function queuePreviewSessionRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const previous = pending.get(key);
  const next = previous ? previous.catch(() => undefined).then(request) : request();
  pending.set(key, next);
  const clear = () => { if (pending.get(key) === next) pending.delete(key); };
  void next.then(clear, clear);
  return next;
}
