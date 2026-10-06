// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../lib/apiClient/transport.js";
import { apiClient } from "../../lib/apiClient";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";
import { WorkspaceRegistryServerSync } from "./WorkspaceRegistryServerSync";

vi.mock("../../lib/apiClient", async () => {
  const { ApiClientError: RealApiClientError } = await import("../../lib/apiClient/transport.js");
  return {
    ApiClientError: RealApiClientError,
    apiClient: {
      workspaceRegistry: vi.fn(),
      saveWorkspaceRegistry: vi.fn(),
    },
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const selfUrl = "https://macbook.example.ts.net";
const remoteUrl = "https://zweit.example.ts.net";
const addedAt = "2026-10-01T10:00:00.000Z";

function remoteDocument() {
  return {
    entries: [
      { id: "self-remote", name: "MacBook", url: selfUrl, addedAt, lastUsedAt: null },
      { id: "zweitserver", name: "Zweitserver", customName: true as const, url: remoteUrl, addedAt, lastUsedAt: null },
    ],
    changedAt: { [selfUrl]: addedAt, [remoteUrl]: addedAt },
    deletedAt: {},
  };
}

function resetStore() {
  window.localStorage.clear();
  useWorkspaceRegistry.setState({ entries: [], selfUrl: null, initialized: false, switchingWorkspace: null, changedAt: {}, deletedAt: {} });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function settle() {
  await vi.advanceTimersByTimeAsync(5_000);
}

describe("WorkspaceRegistryServerSync", () => {
  it("übernimmt einen fremden Server vom Gerät in das lokale Register", async () => {
    vi.mocked(apiClient.workspaceRegistry).mockResolvedValue({ document: remoteDocument(), revision: 4, updatedAt: addedAt });
    vi.mocked(apiClient.saveWorkspaceRegistry).mockImplementation(async (body) => ({
      document: body.document,
      revision: 5,
      updatedAt: addedAt,
    }));
    useWorkspaceRegistry.getState().initialize(selfUrl, "MacBook");
    render(<WorkspaceRegistryServerSync />);
    await settle();
    expect(useWorkspaceRegistry.getState().entries.map((entry) => entry.url)).toContain(remoteUrl);
  });

  it("sichert einen lokal hinzugefügten Server auf dem Gerät", async () => {
    vi.mocked(apiClient.workspaceRegistry).mockResolvedValue({ document: { entries: [], changedAt: {}, deletedAt: {} }, revision: 0, updatedAt: addedAt });
    vi.mocked(apiClient.saveWorkspaceRegistry).mockImplementation(async (body) => ({
      document: body.document,
      revision: 1,
      updatedAt: addedAt,
    }));
    useWorkspaceRegistry.getState().initialize(selfUrl, "MacBook");
    render(<WorkspaceRegistryServerSync />);
    await settle();
    vi.mocked(apiClient.saveWorkspaceRegistry).mockClear();
    useWorkspaceRegistry.getState().add("Zweitserver", remoteUrl);
    await settle();
    expect(vi.mocked(apiClient.saveWorkspaceRegistry)).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(apiClient.saveWorkspaceRegistry).mock.calls[0]?.[0];
    // Die Erstbefüllung hat Revision 1 hinterlassen, der neue Server baut darauf auf.
    expect(sent?.expectedRevision).toBe(1);
    expect(sent?.document.entries.map((entry) => entry.url)).toContain(remoteUrl);
  });

  it("löst einen Revisionskonflikt über Neuladen und Wiederholen", async () => {
    vi.mocked(apiClient.workspaceRegistry).mockResolvedValue({ document: { entries: [], changedAt: {}, deletedAt: {} }, revision: 7, updatedAt: addedAt });
    const conflict = new ApiClientError(409, "WORKSPACE_REGISTRY_CONFLICT", "Konflikt");
    vi.mocked(apiClient.saveWorkspaceRegistry)
      .mockRejectedValueOnce(conflict)
      .mockImplementation(async (body) => ({ document: body.document, revision: 8, updatedAt: addedAt }));
    useWorkspaceRegistry.getState().initialize(selfUrl, "MacBook");
    render(<WorkspaceRegistryServerSync />);
    await settle();
    useWorkspaceRegistry.getState().add("Zweitserver", remoteUrl);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.mocked(apiClient.saveWorkspaceRegistry).mock.calls.length).toBeGreaterThanOrEqual(2);
    const last = vi.mocked(apiClient.saveWorkspaceRegistry).mock.calls.at(-1)?.[0];
    // Die Erstbefüllung hat den 409 bereits über Neuladen aufgelöst (Revision 8).
    expect(last?.expectedRevision).toBe(8);
    expect(last?.document.entries.map((entry) => entry.url)).toContain(remoteUrl);
  });
});
