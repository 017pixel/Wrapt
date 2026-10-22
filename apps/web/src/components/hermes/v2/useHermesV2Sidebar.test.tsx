// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import * as chatRuntimes from "./chat-runtime";
import * as organizationRuntimes from "./organization-runtime";
import { OrganizationClient } from "./organization-client";
import { TestGateway, row, settle, snapshot } from "./chat-test-fixtures";
import { TestOrganization, evidenceA } from "./organization-test-fixtures";
import { useHermesV2Chat } from "./useHermesV2Chat";
import { useHermesV2Sidebar } from "./useHermesV2Sidebar";

describe("Sidebar-Hook und bestehender Chatowner", () => {
  let gateway: TestGateway, rest: TestOrganization, chat: chatRuntimes.ChatRuntime, org: organizationRuntimes.OrganizationRuntime;
  const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway(); rest = new TestOrganization(); chat = new chatRuntimes.ChatRuntime(gateway.createClient());
    org = new organizationRuntimes.OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
    vi.spyOn(chatRuntimes, "getChatRuntime").mockReturnValue(chat); vi.spyOn(organizationRuntimes, "getOrganizationRuntime").mockReturnValue(org);
  });
  afterEach(async () => {
    cleanup(); await settle(); org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false });
    vi.restoreAllMocks(); vi.useRealTimers();
  });
  it("nutzt unter StrictMode denselben Owner, Draft und Socket; Unmount hinterlässt nichts", async () => {
    const { result, unmount } = renderHook(() => ({ chat: useHermesV2Chat({ ownerId: "one", sessionId: "a", onSelectSession: vi.fn() }),
      sidebar: useHermesV2Sidebar({ ownerId: "one" }) }), { wrapper: strict });
    await act(settle); expect(gateway.sockets).toHaveLength(1); expect(chat.owners.records.size).toBe(1);
    expect(result.current.sidebar.search.partial).toBe(false);
    act(() => result.current.chat.setDraft("mein Entwurf")); expect(result.current.chat.draft).toBe("mein Entwurf");
    expect(result.current.sidebar.activeSessionId).toBe("a");
    expect(gateway.sent.filter((frame) => frame.op === "sessions.list")).toHaveLength(0);
    unmount(); await act(settle); expect(vi.getTimerCount()).toBe(0); expect(gateway.socket.readyState).toBe(3); expect(org.owners.size).toBe(0);
  });
  it("erstellt ohne Chat keinen zweiten Owner und keine WS-Verbindung", async () => {
    const { result } = renderHook(() => useHermesV2Sidebar({ ownerId: "sidebar-only", sessionId: "a" }));
    await act(settle); expect(chat.owners.records.size).toBe(0); expect(gateway.sockets).toHaveLength(0);
    expect(result.current.readView.generation).toBeNull(); expect(rest.calls.length).toBeGreaterThan(0);
  });
  it("bindet Read an tatsächliche Auswahl und Sichtbarkeit, Draft bleibt pro Session", async () => {
    gateway.snapshots.set("a", snapshot("a", { messages: [row(1, "Antwort", { readEvidence: evidenceA })] }));
    const { result, rerender } = renderHook(({ sessionId, active }) => ({
      chat: useHermesV2Chat({ ownerId: "one", sessionId, active, onSelectSession: vi.fn() }),
      sidebar: useHermesV2Sidebar({ ownerId: "one", sessionId, active }),
    }), { initialProps: { sessionId: "a", active: true } });
    await act(settle); const old = result.current.sidebar.readView;
    act(() => result.current.chat.setDraft("A"));
    rerender({ sessionId: "b", active: false }); await act(settle);
    expect(result.current.sidebar.activeSessionId).toBe("a"); expect(result.current.sidebar.readView.generation).toBeNull();
    await act(() => old.onVisibleEvidence(old.generation!, [evidenceA]));
    expect(rest.calls.filter((call) => call.path === "organization/read")).toHaveLength(0);
    rerender({ sessionId: "b", active: true }); await act(settle); act(() => result.current.chat.setDraft("B"));
    rerender({ sessionId: "a", active: true }); await act(settle); expect(result.current.chat.draft).toBe("A");
  });
  it("hält Default-off und Flag-off synchron frei von Folgetraffic", async () => {
    useAppPreferences.setState({ hermesV2Enabled: false });
    const { result } = renderHook(() => useHermesV2Sidebar({ ownerId: "one" })); await act(settle);
    expect(rest.calls).toHaveLength(0); expect(result.current.rows).toHaveLength(0);
    await act(async () => { useAppPreferences.setState({ hermesV2Enabled: true }); await settle(); });
    expect(rest.calls.length).toBeGreaterThan(0);
    act(() => useAppPreferences.setState({ hermesV2Enabled: false })); const count = rest.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(60_000)); expect(rest.calls).toHaveLength(count); expect(vi.getTimerCount()).toBe(0);
  });
});
