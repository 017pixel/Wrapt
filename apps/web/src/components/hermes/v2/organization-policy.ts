export const organizationPolicy = {
  pageSize: 100, maxCatalogDepth: 5_000, maxMembers: 1_000, maxCachedSessions: 8_200,
  maxOwners: 32, maxNotices: 1_000, maxReadBatch: 64, maxResponseBytes: 4_194_304,
  requestTimeoutMs: 25_000, maxSnoozeMs: 365 * 86_400_000, workingTickMs: 1_000,
  preferencesKey: "wrapt.hermes-v2-sidebar.v1", preferencesVersion: 1,
} as const;
