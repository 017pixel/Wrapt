// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../lib/apiClient";
import { useOrbitStore } from "../stores/orbit";
import { restartEnv, useSystemRestart } from "./SystemRestartControls";
import { registerEditorReloadGuard } from "../lib/reloadGuard";

vi.mock("../lib/apiClient", async () => {
  const { ApiClientError: RealApiClientError } = await import("../lib/apiClient/transport.js");
  return {
    ApiClientError: RealApiClientError,
    apiClient: {
      restartSystem: vi.fn(),
      triggerUpdate: vi.fn(),
      restartStatus: vi.fn(),
    },
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const statusOk = {
  jobId: "00000000-0000-4000-8000-000000000001",
  phase: "succeeded",
  target: "backend",
  exitCode: 0,
  step: "",
  message: "",
  startedAt: null,
  updatedAt: null,
  logTail: "",
  logFile: null,
  bootId: "boot-neu",
  webBuildId: 7,
  bootIdChanged: true,
  webBuildIdChanged: false,
  baselineBootId: "boot-alt",
  baselineWebBuildId: 7,
} as const;

function laufStatus(override: Record<string, unknown> = {}) {
  return {
    jobId: "00000000-0000-4000-8000-000000000001",
    phase: "running",
    target: "backend",
    exitCode: null,
    step: "Baut …",
    message: "",
    startedAt: null,
    updatedAt: null,
    logTail: "",
    logFile: null,
    bootId: "boot-alt",
    webBuildId: 7,
    bootIdChanged: false,
    webBuildIdChanged: false,
    baselineBootId: "boot-alt",
    baselineWebBuildId: 7,
    ...override,
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  useOrbitStore.setState({ dirty: false });
  restartEnv.reload = vi.fn();
  restartEnv.confirmDirty = vi.fn(() => true);
  vi.mocked(apiClient.restartSystem).mockResolvedValue({
    status: "accepted",
    jobId: "00000000-0000-4000-8000-000000000001",
    target: "backend",
    bootId: "boot-alt",
    webBuildId: 7,
    logFile: "restart-backend.log",
  });
  vi.mocked(apiClient.restartStatus).mockResolvedValue({ ...statusOk });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSystemRestart", () => {
  it("wartet beim Update auf den eigenen Auftrag und beide Marker", async () => {
    vi.mocked(apiClient.triggerUpdate).mockResolvedValue({ status: "accepted", jobId: statusOk.jobId, target: "both", bootId: "boot-alt", webBuildId: 7, logFile: "update.log", fromHash: "alt", toHash: "neu" });
    vi.mocked(apiClient.restartStatus)
      .mockResolvedValueOnce({ ...statusOk, jobId: "00000000-0000-4000-8000-000000000002" })
      .mockResolvedValueOnce({ ...statusOk })
      .mockResolvedValue({ ...statusOk, webBuildId: 8 });
    const { result } = renderHook(() => useSystemRestart({ deadlineMs: 1_000, pollMs: 5 }));
    await act(async () => { await result.current.update(); });
    expect(apiClient.triggerUpdate).toHaveBeenCalledTimes(1);
    expect(apiClient.restartStatus).toHaveBeenCalledTimes(3);
    expect(restartEnv.reload).toHaveBeenCalledTimes(1);
  });

  it("respektiert ungespeicherte Änderungen aus beliebigen Editor-Guards", async () => {
    const unregister = registerEditorReloadGuard(() => true);
    restartEnv.confirmDirty = vi.fn(() => false);
    try {
      const { result } = renderHook(() => useSystemRestart({ deadlineMs: 1_000, pollMs: 5 }));
      await act(async () => { await result.current.restart("backend"); });
      expect(restartEnv.confirmDirty).toHaveBeenCalledTimes(1);
      expect(restartEnv.reload).not.toHaveBeenCalled();
    } finally { unregister(); }
  });

  it("lädt nach bootId-Wechsel neu (Erfolg)", async () => {
    const { result } = renderHook(() => useSystemRestart({ deadlineMs: 1_000, pollMs: 5 }));

    await act(async () => {
      await result.current.restart("backend");
    });

    expect(apiClient.restartSystem).toHaveBeenCalledWith("backend");
    await waitFor(() => expect(restartEnv.reload).toHaveBeenCalledTimes(1));
  });

  it("zeigt Failed mit Log an und lädt nicht neu", async () => {
    vi.mocked(apiClient.restartStatus).mockResolvedValue(
      laufStatus({ phase: "failed", message: "Der Build ist abgestürzt.", logTail: "FEHLERZEILE 42" }),
    );
    const { result } = renderHook(() => useSystemRestart({ deadlineMs: 1_000, pollMs: 5 }));

    await act(async () => {
      await result.current.restart("backend");
    });

    expect(result.current.phase).toEqual({
      status: "error", target: "backend", message: "Der Build ist abgestürzt.", logTail: "FEHLERZEILE 42",
    });
    expect(restartEnv.reload).not.toHaveBeenCalled();
  });

  it("meldet Zeitüberschreitung ohne Marker-Wechsel", async () => {
    vi.mocked(apiClient.restartStatus).mockResolvedValue(laufStatus());
    const { result } = renderHook(() => useSystemRestart({ deadlineMs: 40, pollMs: 5 }));

    await act(async () => {
      await result.current.restart("backend");
    });

    expect(result.current.phase.status).toBe("error");
    if (result.current.phase.status === "error") {
      expect(result.current.phase.message).toContain("Zeitüberschreitung");
    }
    expect(restartEnv.reload).not.toHaveBeenCalled();
  });

  it("bricht auf cancel ab und bleibt bedienbar", async () => {
    vi.mocked(apiClient.restartStatus).mockImplementation(
      () => new Promise(() => undefined),
    );
    const { result } = renderHook(() => useSystemRestart({ deadlineMs: 5_000, pollMs: 5 }));

    await act(async () => {
      const lauf = result.current.restart("backend");
      result.current.cancel();
      await new Promise((resolve) => setTimeout(resolve, 30));
      void lauf;
    });

    expect(result.current.phase).toEqual({ status: "idle" });
    expect(restartEnv.reload).not.toHaveBeenCalled();
  });
});
