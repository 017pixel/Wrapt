// @vitest-environment jsdom
import { StrictMode, type PropsWithChildren } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useLayoutStore } from "../../../stores/layout";
import { useAppPreferences } from "../../../stores/appPreferences";
import { useHermesV2Selection } from "./shell-selection";
import { useHermesV2Chat } from "./useHermesV2Chat";
import * as runtimes from "./chat-runtime";
import { chatPolicy } from "./chat-policy";
import { TestGateway, type TestSocket, settle, snapshot } from "./chat-test-fixtures";

const wrapper = ({ children }: PropsWithChildren) => <StrictMode>
  <MemoryRouter initialEntries={["/hermes-v2?session=saved&keep=yes"]}>{children}</MemoryRouter>
</StrictMode>;
let gateway: TestGateway;
let runtime: runtimes.ChatRuntime;
const currentPath = () => useLayoutStore.getState().panels[0]!.hermesAdminPath;
function usePanelChat(active: boolean) {
  const panel = useLayoutStore((state) => state.panels[0]!);
  const selection = useHermesV2Selection("panel", panel.id, panel.hermesAdminPath, active);
  return useHermesV2Chat({ ownerId: "host", sessionId: selection.sessionId, onSelectSession: selection.selectSession, active });
}
function useRouteChat(ownerId: string, active: boolean) {
  const selection = useHermesV2Selection("route", undefined, undefined, active);
  return { chat: useHermesV2Chat({ ownerId, sessionId: selection.sessionId, onSelectSession: selection.selectSession, active }),
    location: useLocation() };
}
function hold() {
  let request: HermesV2ClientMessage;
  let socket: TestSocket;
  gateway.handle = (frame, connection) => {
    if (frame.op !== "session.create") return false;
    request = frame; socket = connection; return true;
  };
  return { finish: (id: string) => socket.result(request, { snapshot: snapshot(id) }) };
}
beforeEach(() => {
  vi.useFakeTimers();
  useAppPreferences.setState({ hermesV2Enabled: true });
  gateway = new TestGateway(); runtime = new runtimes.ChatRuntime(gateway.createClient());
  vi.spyOn(runtimes, "getChatRuntime").mockReturnValue(runtime);
  useLayoutStore.setState({ panels: [{ id: "host", type: "hermes", projectId: null,
    previewId: null, reloadKey: 0, hermesAdminPath: "/chat?resume=saved" }] });
});
afterEach(async () => {
  await act(async () => { cleanup(); await settle(); runtime.dispose("v2-disabled"); await settle(); });
  expect(gateway.sockets.every((socket) => socket.readyState === 3)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  useAppPreferences.setState({ hermesV2Enabled: false });
  useLayoutStore.getState().resetLayout();
  vi.restoreAllMocks(); vi.useRealTimers();
});

describe("Lokale Startbindung einer tatsächlichen Erstellung", () => {
  it("entwertet echtes Parking und erlaubt die danach neu gestartete Erstellung", async () => {
    const { result, rerender } = renderHook(({ active }) => usePanelChat(active), { initialProps: { active: true }, wrapper });
    await act(settle);
    const held = hold(); let pending!: Promise<string>;
    act(() => { pending = result.current.createSession({ projectId: null }); }); await act(settle);
    rerender({ active: false }); rerender({ active: true });
    await act(async () => { held.finish("late"); await pending; await settle(); });
    expect(runtime.owners.getView("host").sessionId).toBe("saved");
    expect(currentPath()).toBe("/chat?resume=saved");
    const fresh = hold();
    act(() => { pending = result.current.createSession({ projectId: null }); }); await act(settle);
    await act(async () => { fresh.finish("fresh"); await pending; await settle(); });
    expect(runtime.owners.getView("host").sessionId).toBe("fresh");
  });

  it("akzeptiert unveränderte Panelbindung trotz Rerender", async () => {
    const { result, rerender } = renderHook(() => usePanelChat(true), { wrapper }); await act(settle);
    const held = hold(); let pending!: Promise<string>;
    act(() => { pending = result.current.createSession({ projectId: null }); }); await act(settle);
    rerender();
    await act(async () => { held.finish("current"); await pending; await settle(); });
    expect(currentPath()).toBe("/chat?resume=current");
  });

  it.each(["hermes-route", "hermes-standalone"])("behält gute Erstellung und URLparameter für %s", async (ownerId) => {
    const { result } = renderHook(() => useRouteChat(ownerId, true), { wrapper }); await act(settle);
    const held = hold(); let pending!: Promise<string>;
    act(() => { pending = result.current.chat.createSession({ projectId: null }); }); await act(settle);
    await act(async () => { held.finish("full-native-id"); await pending; await settle(); });
    expect(runtime.owners.getView(ownerId).sessionId).toBe("full-native-id");
    expect(new URLSearchParams(result.current.location.search).get("session")).toBe("full-native-id");
    expect(new URLSearchParams(result.current.location.search).get("keep")).toBe("yes");
  });

  it.each(["hermes-route", "hermes-standalone"])("schützt geparktes %s und erlaubt anschließend aktuelle Auswahl", async (ownerId) => {
    const { result, rerender } = renderHook(({ active }) => useRouteChat(ownerId, active), { initialProps: { active: true }, wrapper });
    await act(settle);
    const held = hold(); let pending!: Promise<string>;
    act(() => { pending = result.current.chat.createSession({ projectId: null }); }); await act(settle);
    rerender({ active: false }); rerender({ active: true });
    await act(async () => { held.finish("late"); await pending; await settle(); });
    expect(runtime.owners.getView(ownerId).sessionId).toBe("saved");
    expect(new URLSearchParams(result.current.location.search).get("session")).toBe("saved");
    act(() => result.current.chat.selectSession("current")); await act(settle);
    expect(runtime.owners.getView(ownerId).sessionId).toBe("current");
  });

  it("behält unknown ohne automatische Wiederholung einer Erstellung", async () => {
    const { result } = renderHook(() => usePanelChat(true), { wrapper }); await act(settle);
    hold(); let pending!: Promise<string>;
    act(() => { pending = result.current.createSession({ projectId: null }); });
    const rejected = expect(pending).rejects.toMatchObject({ outcome: "unknown" });
    await act(settle);
    await act(async () => { await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs); await rejected; await settle(); });
    expect(result.current.unknownSend).toMatchObject({ operation: "session.create", canResend: false });
    expect(gateway.sent.filter((frame) => frame.op === "session.create")).toHaveLength(1);
    expect(currentPath()).toBe("/chat?resume=saved");
  });
});
