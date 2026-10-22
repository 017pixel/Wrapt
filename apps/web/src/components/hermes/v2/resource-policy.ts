/** Flüchtige Browsergrenzen; native Inhaltsgrenzen bleiben im gemeinsamen Vertrag. */
export const resourcePolicy = {
  requestTimeoutMs: 25_000,
  maxResponseBytes: 4_194_304,
  concurrentReads: 2,
  queuedReads: 8,
  actions: 32,
  invalidationMs: 200,
} as const;
