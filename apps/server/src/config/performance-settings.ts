import type { z } from "zod";
import { boundedIntegerFromEnvironment } from "./settings-helpers.js";

export const codexSessionReadDefaults = {
  discoveryMilliseconds: 60_000,
  blockBytes: 64 * 1024,
  pollBytes: 4 * 1024 * 1024,
  concurrency: 4,
};
export const remoteT3PollDefaults = { concurrency: 4, maximumBackoffMilliseconds: 300_000 };

export const performanceSettingsShape = {
  WEB_BUILD_METRICS_CACHE_MS: boundedIntegerFromEnvironment(60_000, 1_000, 60_000),
  CODEX_SESSION_DISCOVERY_MS: boundedIntegerFromEnvironment(codexSessionReadDefaults.discoveryMilliseconds, 5_000, 300_000),
  CODEX_SESSION_READ_BLOCK_BYTES: boundedIntegerFromEnvironment(codexSessionReadDefaults.blockBytes, 4_096, 1_048_576),
  CODEX_SESSION_POLL_BYTES: boundedIntegerFromEnvironment(codexSessionReadDefaults.pollBytes, 65_536, 67_108_864),
  CODEX_SESSION_READ_CONCURRENCY: boundedIntegerFromEnvironment(codexSessionReadDefaults.concurrency, 1, 16),
  HERMES_STATUS_CACHE_MS: boundedIntegerFromEnvironment(1_000, 0, 2_000),
  HERMES_COMMIT_CACHE_MS: boundedIntegerFromEnvironment(60_000, 0, 60_000),
  T3_REMOTE_POLL_CONCURRENCY: boundedIntegerFromEnvironment(remoteT3PollDefaults.concurrency, 1, 16),
  T3_REMOTE_POLL_MAX_BACKOFF_MS: boundedIntegerFromEnvironment(remoteT3PollDefaults.maximumBackoffMilliseconds, 5_000, 600_000),
  HERMES_WEBSOCKET_BUFFERED_BYTES: boundedIntegerFromEnvironment(2 * 1024 * 1024, 131_072, 536_870_912),
  ORBIT_BACKUP_BATCH_SIZE: boundedIntegerFromEnvironment(5, 1, 50),
  ORBIT_BACKUP_BATCH_MS: boundedIntegerFromEnvironment(25, 1, 1_000),
  ORBIT_BACKUP_SHUTDOWN_MS: boundedIntegerFromEnvironment(5_000, 100, 60_000),
  ORBIT_BACKUP_RETRY_MS: boundedIntegerFromEnvironment(5_000, 100, 60_000),
};

type PerformanceEnvironment = z.infer<z.ZodObject<typeof performanceSettingsShape>>;

export function resolvePerformanceSettings(environment: PerformanceEnvironment) {
  return {
    webBuildMetricsCacheMilliseconds: environment.WEB_BUILD_METRICS_CACHE_MS,
    hermesStatusCacheMilliseconds: environment.HERMES_STATUS_CACHE_MS,
    hermesCommitCacheMilliseconds: environment.HERMES_COMMIT_CACHE_MS,
    remoteT3Poll: { concurrency: environment.T3_REMOTE_POLL_CONCURRENCY, maximumBackoffMilliseconds: environment.T3_REMOTE_POLL_MAX_BACKOFF_MS },
    hermesWebSocketBufferedBytes: environment.HERMES_WEBSOCKET_BUFFERED_BYTES,
    orbitBackupDrain: { batchSize: environment.ORBIT_BACKUP_BATCH_SIZE, batchMilliseconds: environment.ORBIT_BACKUP_BATCH_MS,
      shutdownMilliseconds: environment.ORBIT_BACKUP_SHUTDOWN_MS, retryMilliseconds: environment.ORBIT_BACKUP_RETRY_MS },
    codexSessionRead: {
      discoveryMilliseconds: environment.CODEX_SESSION_DISCOVERY_MS,
      blockBytes: environment.CODEX_SESSION_READ_BLOCK_BYTES,
      pollBytes: environment.CODEX_SESSION_POLL_BYTES,
      concurrency: environment.CODEX_SESSION_READ_CONCURRENCY,
    },
  };
}
