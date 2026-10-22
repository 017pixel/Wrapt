/** Protokollgrenzen zentral halten; Umgebungswerte injiziert die App aus ihren Settings. */
export const hermesV2Policy = {
  browserBytes: 1_048_576,
  upstreamBytes: 8_388_608,
  sendQueueBytes: 4_194_304,
  maxPending: 128,
  maxManagers: 32,
  maxSessions: 100,
  maxRequests: 100,
  maxOperations: 256,
  maxBufferedEvents: 2_000,
  rpcTimeoutMs: 20_000,
  heartbeatMs: 15_000,
  heartbeatTimeoutMs: 30_000,
  idleMs: 60_000,
  retryMaxMs: 15_000,
  snapshotAttempts: 5,
  secretValues: 100,
  secretBytes: 1_048_576,
  secretStreams: 256,
  secretBufferBytes: 1_048_576,
  workRows: 100,
} as const;
export type HermesV2Policy = { [K in keyof typeof hermesV2Policy]: number };
