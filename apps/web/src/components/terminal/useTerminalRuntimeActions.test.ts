// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { TerminalSession } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import type { WebTerminalHandle } from "./WebTerminal";
import { useTerminalRuntimeActions } from "./useTerminalRuntimeActions";

const session = { id: "session-1", runtimeId: "runtime-1" } as TerminalSession;

afterEach(() => vi.restoreAllMocks());

function setup() {
  const handles = { current: new Map<string, WebTerminalHandle>() };
  const openEntry = vi.fn();
  const refresh = vi.fn();
  const reportError = vi.fn();
  const view = renderHook(() => useTerminalRuntimeActions({ handles, openEntry, refresh, reportError }));
  return { ...view, handles, openEntry, refresh, reportError };
}

function terminalHandle() {
  const handle = {
    markSessionClosed: vi.fn(),
    prepareRestart: vi.fn(),
    resync: vi.fn(),
  };
  return handle as unknown as WebTerminalHandle & typeof handle;
}

test("markiert den Renderer erst nach erfolgreichem API-Close lokal als beendet", async () => {
  const close = vi.spyOn(apiClient, "closeTerminalSession").mockResolvedValue(undefined);
  const { result, handles, refresh, reportError } = setup();
  const terminal = terminalHandle();
  handles.current.set("runtime-1", terminal);

  await act(async () => { result.current.close(session); });

  expect(close).toHaveBeenCalledWith("session-1");
  expect(terminal.markSessionClosed).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledOnce();
  expect(reportError).not.toHaveBeenCalled();
});

test("bereitet den offenen Renderer vor dem API-Restart vor", async () => {
  const sessions = vi.spyOn(apiClient, "terminalSessions").mockResolvedValue({ sessions: [session], updatedAt: new Date().toISOString() });
  const restart = vi.spyOn(apiClient, "restartTerminalSession").mockResolvedValue(undefined);
  const { result, handles, refresh } = setup();
  const terminal = terminalHandle();
  handles.current.set("runtime-1", terminal);

  await act(async () => { result.current.restart("runtime-1"); });

  expect(terminal.prepareRestart).toHaveBeenCalledOnce();
  expect(terminal.prepareRestart.mock.invocationCallOrder[0]).toBeLessThan(sessions.mock.invocationCallOrder[0]!);
  expect(restart).toHaveBeenCalledWith("session-1");
  expect(refresh).toHaveBeenCalledOnce();
});

test("meldet einen fehlgeschlagenen Close sichtbar und lässt den Renderer offen", async () => {
  vi.spyOn(apiClient, "closeTerminalSession").mockRejectedValue(new Error("Server nicht erreichbar."));
  const { result, handles, refresh, reportError } = setup();
  const terminal = terminalHandle();
  handles.current.set("runtime-1", terminal);

  await act(async () => { result.current.close(session); });

  expect(terminal.markSessionClosed).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(reportError).toHaveBeenCalledWith("runtime-1", "Server nicht erreichbar.");
});
