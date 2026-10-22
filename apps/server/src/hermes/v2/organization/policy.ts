/** Fachliche Grenzen des Organisationsdiensts, unabhängig von Runtime-/RPC-Budgets. */
export const organizationPolicy = {
  evidenceTtlMs: 15 * 60_000, evidencePerOwner: 4096, evidenceTotal: 16384, sourcesPerEvidence: 64,
  undoTtlMs: 10_000, undoPerOwner: 100, undoTotal: 1000,
  pageSize: 100, maxPins: 1000, catalogDepth: 5000, httpBytes: 4 * 1024 * 1024,
  historyPage: 64, historyWorkers: 2, dirtySessions: 512, maxKnownSources: 512,
  snoozeMaxMs: 365 * 86400_000,
  activityProofs: 20,
} as const;
