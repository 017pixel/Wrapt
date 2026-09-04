// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedAccount } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import { emptyPluginDraft } from "./pluginDefaults";
import { PluginTopbar } from "./PluginTopbar";

vi.mock("../../lib/apiClient", () => ({
  apiClient: {
    activateAccount: vi.fn(),
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function account(id: string, label: string, active: boolean): ManagedAccount {
  const timestamp = "2026-08-30T00:00:00.000Z";
  return {
    id,
    provider: "codex",
    label,
    email: label,
    profilePath: `/profiles/${id}`,
    source: "local",
    enabled: true,
    active,
    plan: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function renderTopbar() {
  const work = account("00000000-0000-0000-0000-000000000001", "arbeit@example.com", false);
  const privateAccount = account("00000000-0000-0000-0000-000000000002", "privat@example.com", true);
  const draft = emptyPluginDraft("codex-account-switcher");
  draft.name = "Codex-Accounts";
  draft.surfaces = ["topbar"];
  draft.surfaceContributions = [
    { id: "work", surface: "topbar", title: "Arbeit", description: "Arbeits-Codex-Account aktivieren.", mobileBehavior: "same", token: "accent" },
    { id: "private", surface: "topbar", title: "Main Private", description: "Main-Private-Codex-Account aktivieren.", mobileBehavior: "same", token: "accent" },
  ];
  draft.functions = [
    { id: "work", label: "Arbeit", action: "activate-account", value: "codex:0" },
    { id: "private", label: "Main Private", action: "activate-account", value: "codex:1" },
  ];
  const client = new QueryClient();
  client.setQueryData(["accounts"], { accounts: [privateAccount, work] });
  client.setQueryData(["extensions", "runtime"], {
    runtimes: [{ extensionId: "wrapt.example.codex-account-switcher", version: "0.1.0", packageIntegrity: `sha256:${"0".repeat(64)}`, content: draft }],
  });
  return { client, work, privateAccount, view: render(<QueryClientProvider client={client}><PluginTopbar /></QueryClientProvider>) };
}

describe("Plugin-Topbar", () => {
  it("rendert deklarierte Account-Schalter und markiert den aktiven", () => {
    renderTopbar();

    expect(screen.getByRole("group", { name: "Aktive Plugin-Topbar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Arbeit wechseln/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Main Private wechseln/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("löst Provider-Slots deterministisch auf und aktiviert den gewählten Account", async () => {
    const { work } = renderTopbar();
    vi.mocked(apiClient.activateAccount).mockResolvedValue({ account: work, adoptedInto: null, backupPath: null, migratedTo: null });

    fireEvent.click(screen.getByRole("button", { name: /Arbeit wechseln/ }));

    await waitFor(() => expect(apiClient.activateAccount).toHaveBeenCalledWith(work.id));
  });

  it("bleibt unsichtbar, wenn kein aktives Topbar-Plugin vorhanden ist", () => {
    const client = new QueryClient();
    client.setQueryData(["accounts"], { accounts: [] });
    client.setQueryData(["extensions", "runtime"], { runtimes: [] });

    render(<QueryClientProvider client={client}><PluginTopbar /></QueryClientProvider>);

    expect(screen.queryByRole("group", { name: "Aktive Plugin-Topbar" })).toBeNull();
  });
});
