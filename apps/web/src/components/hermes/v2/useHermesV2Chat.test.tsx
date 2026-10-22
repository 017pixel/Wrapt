// @vitest-environment jsdom
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import * as runtimes from "./chat-runtime";
import { useHermesV2Chat } from "./useHermesV2Chat";
import { event, settle, snapshot, TestGateway } from "./chat-test-fixtures";
import { approval, requestKey } from "./chat-request-test-fixtures";

describe("useHermesV2Chat Lifecycle", () => {
  let gateway: TestGateway;
  let runtime: runtimes.ChatRuntime;
  const owner = (id: string, sessionId = "a") => ({ ownerId: id, sessionId, onSelectSession: vi.fn() });
  const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
  beforeEach(() => {
    vi.useFakeTimers();
    gateway = new TestGateway(); runtime = new runtimes.ChatRuntime(gateway.createClient());
    vi.spyOn(runtimes, "getChatRuntime").mockReturnValue(runtime);
    useAppPreferences.setState({ hermesV2Enabled: true });
  });
  afterEach(async () => {
    cleanup(); await settle(); runtime.dispose("v2-disabled");
    useAppPreferences.setState({ hermesV2Enabled: false });
    vi.restoreAllMocks(); vi.useRealTimers();
  });
  it("teilt unter echtem StrictMode zwei Hook-Owner derselben Session", async () => {
    const { result, unmount } = renderHook(() => ({ a: useHermesV2Chat(owner("one")), b: useHermesV2Chat(owner("two")) }), { wrapper: strict });
    await act(settle);
    expect(gateway.sockets).toHaveLength(1);
    expect(gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(1);
    act(() => result.current.a.setDraft("A"));
    expect(result.current.a.draft).toBe("A"); expect(result.current.b.draft).toBe("");
    act(() => gateway.socket.event(event("message.delta", 1, { turnId: "turn", text: "gleicher Stream" })));
    expect(result.current.a.activeSnapshot).toBe(result.current.b.activeSnapshot);
    unmount(); await act(settle);
    expect(gateway.socket.readyState).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("hält A/B getrennt und parkt die Auswahl trotz fremder Query", async () => {
    const { result, rerender } = renderHook(({ active, sessionId }) => ({
      a: useHermesV2Chat({ ...owner("one", sessionId), active }), b: useHermesV2Chat(owner("two", "b")),
    }), { initialProps: { active: true, sessionId: "a" } });
    await act(settle);
    rerender({ active: false, sessionId: "b" }); await act(settle);
    expect(result.current.a.activeSnapshot?.sessionId).toBe("a");
    expect(result.current.b.activeSnapshot?.sessionId).toBe("b");
    expect(runtime.owners.records.get("one")?.options.active).toBe(false);
  });
  it("unterscheidet Dokument-Sichtbarkeit von Route-Aktivität ohne Polls", async () => {
    const { result } = renderHook(() => useHermesV2Chat({ ...owner("one"), active: false }));
    await act(settle);
    const sent = gateway.sent.length;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(runtime.owners.records.get("one")?.options).toMatchObject({ active: false, visible: false });
    act(() => gateway.socket.event(event("message.delta", 1, { turnId: "t", text: "läuft weiter" })));
    expect(result.current.activeSnapshot?.messages.at(-1)?.text).toBe("läuft weiter");
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(gateway.sent).toHaveLength(sent);
  });
  it("öffnet im ausgeschalteten Hook keinen Socket und räumt beim Abschalten sofort auf", async () => {
    useAppPreferences.setState({ hermesV2Enabled: false });
    const { result } = renderHook(() => useHermesV2Chat(owner("one")), { wrapper: strict });
    await act(settle);
    expect(gateway.sockets).toHaveLength(0);
    expect(result.current.activeSnapshot).toBeNull();
    act(() => useAppPreferences.setState({ hermesV2Enabled: true })); await act(settle);
    expect(gateway.sockets).toHaveLength(1);
    const count = gateway.sent.length;
    act(() => useAppPreferences.setState({ hermesV2Enabled: false }));
    expect(gateway.socket.readyState).toBe(3);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(gateway.sent).toHaveLength(count);
    expect(result.current.connection.state).toBe("idle");
  });
  it("projiziert gemeinsame Requestzustände unter StrictMode auch für Root-/Tip-Owner", async () => {
    gateway.snapshots.set("a", snapshot("a", { requests: [approval()] }));
    gateway.snapshots.set("b", snapshot("b", { requests: [approval("b")] }));
    const { result } = renderHook(() => ({ a: useHermesV2Chat(owner("one")), b: useHermesV2Chat(owner("two", "b")) }), { wrapper: strict });
    await act(settle);
    await act(async () => {
      const first = result.current.a.respond(approval(), { kind: "approval", choice: "once" });
      const second = result.current.b.respond(approval("b"), { kind: "approval", choice: "deny" });
      await Promise.all([first, second]);
    });
    expect(result.current.a.requestStates).toEqual([{ key: requestKey, epoch: "epoch", status: "pending" }]);
    expect(result.current.b.requestStates).toEqual(result.current.a.requestStates);
    expect(gateway.sent.filter((frame) => frame.op === "request.respond")).toHaveLength(1);
    act(() => gateway.socket.event(event("request.closed", 1, { requestKey, reason: "answered" })));
    expect(result.current.a.requestStates).toEqual([]); expect(result.current.b.requestStates).toEqual([]);
    act(() => useAppPreferences.setState({ hermesV2Enabled: false }));
    expect(result.current.a.requestStates).toEqual([]); expect(result.current.b.requestStates).toEqual([]);
  });
  it("koppelt Request-/Ownerbenachrichtigungen nicht an Tokens", async () => {
    const { result } = renderHook(() => useHermesV2Chat(owner("one"))); await act(settle);
    const changed = vi.fn(), unsubscribe = runtime.owners.subscribe("one", changed);
    act(() => gateway.socket.event(event("message.delta", 1, { turnId: "t", text: "Token" })));
    expect(result.current.activeSnapshot?.messages.at(-1)?.text).toBe("Token");
    expect(changed).not.toHaveBeenCalled(); unsubscribe();
  });
});
