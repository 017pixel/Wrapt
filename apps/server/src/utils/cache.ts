export interface AsyncCache<T> {
  get(): Promise<T>;
  clear(): void;
}

export function createAsyncCache<T>(ttlMilliseconds: number, loader: () => Promise<T>): AsyncCache<T> {
  let expiresAt = 0;
  let value: T | undefined;
  let pending: Promise<T> | undefined;
  let generation = 0;

  return {
    async get() {
      const now = Date.now();
      if (value !== undefined && now < expiresAt) return value;
      if (pending !== undefined) return pending;

      const loadingGeneration = generation;
      const loading = loader()
        .then((loaded) => {
          if (loadingGeneration === generation) {
            value = loaded;
            expiresAt = Date.now() + ttlMilliseconds;
          }
          return loaded;
        })
        .finally(() => {
          if (pending === loading) pending = undefined;
        });
      pending = loading;
      return loading;
    },
    clear() {
      generation += 1;
      pending = undefined;
      value = undefined;
      expiresAt = 0;
    },
  };
}
