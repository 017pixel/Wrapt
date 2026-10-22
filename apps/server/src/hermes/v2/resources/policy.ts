/** Ausschließlich Ressourcenbudgets; keine zusätzliche Laufzeit- oder Pollengine. */
export const resourcePolicy = { fileBytes: 65_536, pendingRecords: 100, workers: 2, jobs: 100, skills: 500,
  pendingText: 16_384, responseBytes: 1_048_576, activeRequests: 128 } as const;
