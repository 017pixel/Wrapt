import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";

const scheduledJob = {
    id: "workbench.agent-tasks.scheduled-job.sync",
    title: "Agent Tasks synchronisieren",
    description: "Synchronisiert Agent Tasks regelmäßig.",
    provider: "workbench.agent-tasks.scheduled-job-provider.sync",
    enabledByDefault: true,
    schedule: {
      type: "interval",
      everyMilliseconds: 300_000,
      initialDelayMilliseconds: 1_000,
    },
    timeoutMilliseconds: 30_000,
    concurrency: { mode: "skip" },
    missedRuns: { mode: "run-once" },
    retries: {
      maxAttempts: 3,
      initialBackoffMilliseconds: 1_000,
      maximumBackoffMilliseconds: 30_000,
      multiplier: 2,
    },
    idempotency: "host-key",
    cancellationTimeoutMilliseconds: 5_000,
    historyLimit: 100,
  } as const;

describe("Extension Manifest: schedules", () => {
  it("akzeptiert Scheduled Jobs als tatsächliche onSchedule-Ziele", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: [
            "onSchedule:workbench.agent-tasks.scheduled-job.sync",
          ],
          contributes: { scheduledJobs: [scheduledJob] },
        }).success,
      ).toBe(true);
    });

  it("verlangt für Scheduled Jobs eigene Provider und Server-Entrypoint", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            scheduledJobs: [
              {
                ...scheduledJob,
                provider: "workbench.other.scheduled-job-provider.sync",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: { ui: "./dist/ui.js" },
          contributes: { scheduledJobs: [scheduledJob] },
        }).success,
      ).toBe(false);
    });

  it("weist fehlende onSchedule-Ziele und manifestweit doppelte Job-IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: [
            "onSchedule:workbench.agent-tasks.scheduled-job.missing",
          ],
          contributes: { scheduledJobs: [scheduledJob] },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            scheduledJobs: [
              {
                ...scheduledJob,
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
