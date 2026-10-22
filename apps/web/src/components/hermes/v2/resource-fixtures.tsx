import { vi } from "vitest";
import type {
  HermesV2ResourceError,
  HermesV2ResourceText,
} from "@wrapt/contracts/hermes-v2";
import type {
  HermesV2Resources,
  ResourceActionView,
  ResourceError,
  ResourceRead,
} from "./resource-types";

/**
 * Testflächenspiegel mit echten Vertragstypen: Werte laut gebauten Schemas,
 * Verhalten über Spiegelfunktionen mit gespiegelten Aufrufen. Kein Fakeerfolg
 * im Produkt; Read-Objekte starten auf idle und werden je Fall gesetzt.
 */
export function idleRead<T>(): ResourceRead<T> {
  return { status: "idle", data: null, error: null, stale: false };
}

export function readyRead<T>(data: T, stale = false): ResourceRead<T> {
  return { status: "ready", data, error: null, stale };
}

export function missingRead<T>(): ResourceRead<T> {
  return { status: "missing", data: null, error: null, stale: false };
}

export function errorRead<T>(
  error: Pick<HermesV2ResourceError, "code" | "message" | "outcome"> & {
    status?: number | null;
  },
): ResourceRead<T> {
  const filled: ResourceError = {
    code: error.code,
    message: error.message,
    outcome: error.outcome,
    status: error.status ?? null,
    retryable: false,
  };
  return { status: "error", data: null, stale: false, error: filled };
}

export function textResource(
  overrides: Partial<HermesV2ResourceText> = {},
): HermesV2ResourceText {
  return {
    text: "Inhalt",
    status: "available",
    bytes: 6,
    truncated: false,
    ...overrides,
  };
}

export function actionView(
  overrides: Partial<ResourceActionView> = {},
): ResourceActionView {
  const error: ResourceError | null =
    overrides.error === null || overrides.error === undefined
      ? null
      : {
          code: overrides.error.code,
          message: overrides.error.message,
          outcome: overrides.error.outcome,
          status: overrides.error.status ?? null,
          retryable: false,
        };
  return {
    key: overrides.key ?? "a1",
    operation: overrides.operation ?? "cron.create",
    targetId: overrides.targetId ?? null,
    status: overrides.status ?? "pending",
    result: overrides.result ?? null,
    error,
    reconciled: overrides.reconciled ?? false,
  };
}

/** Spiegel der Viewmodel-Methoden; Assertions prüfen konkrete Aufrufe. */
export function makeResourceFixture(
  overrides: Partial<HermesV2Resources> = {},
): HermesV2Resources {
  const base = {
    generation: 1,
    available: true,
    area: null,
    connection: { state: "idle", attempt: 0, error: null },
    cron: {
      list: idleRead(),
      selectedId: null as string | null,
      detail: idleRead(),
      runs: idleRead(),
    },
    skills: {
      list: idleRead(),
      selectedName: null as string | null,
      detail: idleRead(),
    },
    memory: idleRead(),
    pending: idleRead(),
    diagnostics: idleRead(),
    sessionDeletion: idleRead(),
    actions: [] as ResourceActionView[],
    actionError: null,
    copy: { status: "idle", error: null },
    refresh: vi.fn().mockResolvedValue(undefined),
    selectCron: vi.fn(),
    refreshCronDetail: vi.fn().mockResolvedValue(undefined),
    refreshCronRuns: vi.fn().mockResolvedValue(undefined),
    selectSkill: vi.fn(),
    prepareCronConfirmation: vi.fn(() => ({
      key: "tok-confirm",
      generation: 1,
      targetId: "job-1",
      operation: "cron.run",
      paused: false,
    })),
    prepareSessionDeletion: vi.fn(() => ({
      key: "tok-delete",
      generation: 1,
      targetId: "s1",
      operation: "session.delete",
      paused: null,
    })),
    createCron: vi.fn().mockResolvedValue(undefined),
    updateCron: vi.fn().mockResolvedValue(undefined),
    pauseCron: vi.fn().mockResolvedValue(undefined),
    resumeCron: vi.fn().mockResolvedValue(undefined),
    runCron: vi.fn().mockResolvedValue(undefined),
    deleteCron: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    reconcileAction: vi.fn().mockResolvedValue(undefined),
    copyDiagnostics: vi.fn().mockResolvedValue(undefined),
    clearActionError: vi.fn(),
    ...overrides,
  };
  return base as unknown as HermesV2Resources;
}
