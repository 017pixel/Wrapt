import type { HermesV2CronJob, HermesV2CronList } from "@wrapt/contracts/hermes-v2";

/** Feste native Belege der UItests, laut Gebauten Contracts. */
export function cronJob(overrides: Partial<HermesV2CronJob> = {}): HermesV2CronJob {
  return {
    id: "job-1",
    name: "Nächtliche Zusammenfassung",
    prompt: "Fasse den Tag zusammen",
    schedule: "0 3 * * *",
    repeat: 5,
    completedRuns: 12,
    paused: false,
    state: "waiting",
    nextRunAt: "2026-10-18T03:00:00Z",
    lastRunAt: "2026-10-17T03:00:00Z",
    lastStatus: "ok",
    lastError: null,
    workdir: "/home/bbecker/projects/Wrapt",
    execution: { mode: "agent", script: null, noAgent: false },
    additional: [{ key: "source", value: "native-import", truncated: false }],
    valid: true,
    truncated: false,
    ...overrides,
  };
}

export function cronList(jobs: HermesV2CronJob[], truncated = false): HermesV2CronList {
  return {
    scope: "0".repeat(64),
    jobs,
    truncated,
  };
}
