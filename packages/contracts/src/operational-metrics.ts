import { z } from "zod";

const isoDateSchema = z.iso.datetime({ offset: true });

export const operationalMetricsSchema = z.object({
  capturedAt: isoDateSchema,
  uptimeSeconds: z.number().nonnegative(),
  http: z.object({
    activeRequests: z.number().int().nonnegative(),
    totalRequests: z.number().int().nonnegative(),
    clientErrors: z.number().int().nonnegative(),
    serverErrors: z.number().int().nonnegative(),
    routes: z.array(z.object({
      method: z.string().min(1),
      route: z.string().min(1),
      count: z.number().int().nonnegative(),
      errorCount: z.number().int().nonnegative(),
      p95Milliseconds: z.number().nonnegative(),
      p99Milliseconds: z.number().nonnegative(),
    })),
  }),
  websocket: z.object({
    totalOverloads: z.number().int().nonnegative(),
    totalCloses: z.number().int().nonnegative(),
    bridges: z.array(z.object({
      label: z.string().min(1),
      forwardedMessages: z.number().int().nonnegative(),
      forwardedBytes: z.number().int().nonnegative(),
      overloads: z.number().int().nonnegative(),
      closes: z.number().int().nonnegative(),
    })),
  }),
  push: z.object({
    activeDeliveries: z.number().int().nonnegative(),
    totalDeliveries: z.number().int().nonnegative(),
    totalAttempted: z.number().int().nonnegative(),
    totalSent: z.number().int().nonnegative(),
    totalRemoved: z.number().int().nonnegative(),
    totalFailed: z.number().int().nonnegative(),
    totalTimeouts: z.number().int().nonnegative(),
    p95Milliseconds: z.number().nonnegative(),
  }),
  build: z.object({
    releaseCount: z.number().int().nonnegative(),
    retainedFileCount: z.number().int().nonnegative(),
    retainedBytes: z.number().int().nonnegative(),
    maxReleases: z.number().int().positive(),
    gracePeriodMilliseconds: z.number().int().nonnegative(),
    latestCreatedAt: isoDateSchema.nullable(),
    latestDurationMilliseconds: z.number().nonnegative(),
  }),
  eventLoop: z.object({
    meanMilliseconds: z.number().nonnegative(),
    p99Milliseconds: z.number().nonnegative(),
    maxMilliseconds: z.number().nonnegative(),
  }),
  processMemory: z.object({
    rssBytes: z.number().int().nonnegative(),
    heapUsedBytes: z.number().int().nonnegative(),
    heapTotalBytes: z.number().int().nonnegative(),
    externalBytes: z.number().int().nonnegative(),
  }),
  degradedReasons: z.array(z.string().min(1)),
  audit: z.object({
    valid: z.boolean(),
    entries: z.number().int().nonnegative(),
    latestAt: isoDateSchema.nullable(),
  }),
  orbit: z.object({
    pendingBackups: z.number().int().nonnegative(),
    oldestPendingAt: isoDateSchema.nullable(),
    lastError: z.string().nullable(),
    failedAt: isoDateSchema.nullable(),
  }),
  preview: z.object({
    totalSlots: z.number().int().nonnegative(),
    freeSlots: z.number().int().nonnegative(),
    resettingSlots: z.number().int().nonnegative(),
    quarantinedSlots: z.number().int().nonnegative(),
  }),
  extensions: z.object({
    quarantined: z.number().int().nonnegative(),
    recoveredTransientOperations: z.number().int().nonnegative(),
    backup: z.object({
      available: z.boolean(),
      revision: z.number().int().nonnegative(),
      lastError: z.string().nullable(),
    }),
  }),
});

export type OperationalMetricsResponse = z.infer<typeof operationalMetricsSchema>;
