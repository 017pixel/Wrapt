// @vitest-environment jsdom
import { StrictMode, type PropsWithChildren } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { freshOrbitWorkspace, useOrbitStore } from "../../../stores/orbit";
import { nodeFromInput } from "../../../stores/orbitNodeFactory";
import { useAppPreferences } from "../../../stores/appPreferences";
import { useOrbitHermesPath } from "../../orbit/useOrbitHermesPath";
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
const current = () => useOrbitStore.getState().document.boards[0]!.nodes[0]!;
function useOrbitChat(active: boolean) {
  const document = useOrbitStore((state) => state.document);
  const node = document.boards.find((board) => board.id === document.activeBoardId)!.nodes[0]!;
  const host = useOrbitHermesPath(node, active);
  const selection = useHermesV2Selection("panel", node.id, host.hermesAdminPath, active, host.onHermesPathChange);
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
type Change = "runtime" | "project" | "board" | "path";
function changeHost(kind: Change) {
  const store = useOrbitStore.getState(); const node = current();
  if (kind === "board") {
    const boardId = store.document.activeBoardId;
    store.activateBoard("other-board"); store.activateBoard(boardId);
  } else if (kind === "runtime") {
    store.updateNode(node.id, { runtimeId: "other-runtime" }); store.updateNode(node.id, { runtimeId: node.runtimeId });
  } else if (kind === "project") {
    store.updateNode(node.id, { projectId: "other-project" }); store.updateNode(node.id, { projectId: node.projectId });
  } else {
    store.updateNode(node.id, { state: { ...node.state, hermesAdminPath: "/chat?resume=other" } });
    store.updateNode(node.id, { state: node.state });
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  useAppPreferences.setState({ hermesV2Enabled: true });
  gateway = new TestGateway(); runtime = new runtimes.ChatRuntime(gateway.createClient());
  vi.spyOn(runtimes, "getChatRuntime").mockReturnValue(runtime);
  const document = freshOrbitWorkspace();
  const node = { ...nodeFromInput({ type: "tool", toolType: "hermes", title: "Host", position: { x: 0, y: 0 } }, 1),
    id: "host-node", runtimeId: "runtime", state: { hermesAdminPath: "/chat?resume=saved", marker: "keep" } };
  const board = { ...document.boards[0]!, nodes: [node] };
  useOrbitStore.setState({ document: { ...document, boards: [board, { ...board, id: "other-board" }] }, hydrated: true });
});
afterEach(async () => {
  await act(async () => { cleanup(); await settle(); runtime.dispose("v2-disabled"); await settle(); });
  expect(gateway.sockets.every((socket) => socket.readyState === 3)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  useAppPreferences.setState({ hermesV2Enabled: false });
  useOrbitStore.setState({ document: freshOrbitWorkspace() });
  vi.restoreAllMocks(); vi.useRealTimers();
});

describe("Lokale Startbindung einer tatsächlichen Erstellung", () => {
  it.each(["runtime", "project", "board", "path"] as const)("bewahrt Host UND Runtimeauswahl bei %s-A-B-A direkt vor dem ACK", async (kind) => {
    const foreignSelect = vi.fn();
    runtime.acquire({ ownerId: "foreign", sessionId: "foreign-session", active: true, onSelectSession: foreignSelect });
    const { result } = renderHook(() => useOrbitChat(true), { wrapper });
    await act(settle);
    const held = hold(); let pending!: Promise<string>;
    act(() => { pending = result.current.createSession({ projectId: null }); }); await act(settle);
    await act(async () => {
      changeHost(kind);
      held.finish("late-created");
      expect(await pending).toBe("late-created"); await settle();
    });
    expect(current().state).toEqual({ hermesAdminPath: "/chat?resume=saved", marker: "keep" });
    expect(runtime.owners.getView("host").sessionId).toBe("saved");
    expect(runtime.owners.getView("foreign").sessionId).toBe("foreign-session");
    expect(foreignSelect).not.toHaveBeenCalled();
    expect(runtime.sessionIsLeased("late-created")).toBe(false);
    const fresh = hold();
    act(() => { pending = result.current.createSession({ projectId: null }); }); await act(settle);
    await act(async () => { fresh.finish("fresh-created"); await pending; await settle(); });
    expect(current().state.hermesAdminPath).toBe("/chat?resume=fresh-created");
    expect(runtime.owners.getView("host").sessionId).toBe("fresh-created");
    expect(gateway.sent.filter((frame) => frame.op === "session.create")).toHaveLength(2);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
  });

  it("entwertet echtes Parking und erlaubt die danach neu gestartete Erstellung", async () => {
    const { result, rerender } = renderHook(({ active }) => useOrbitChat(active), { initialProps: { active: true }, wrapper });
    await act(settle);
    const held = hold(); let pending!: Promise<string>;
    act(() => { pending = result.current.createSession({ projectId: null }); }); await act(settle);
    rerender({ active: false }); rerender({ active: true });
    await act(async () => { held.finish("late"); await pending; await settle(); });
    expect(runtime.owners.getView("host").sessionId).toBe("saved");
    expect(current().state.hermesAdminPath).toBe("/chat?resume=saved");
    const fresh = hold();
    act(() => { pending = result.current.createSession({ projectId: null }); }); await act(settle);
    await act(async () => { fresh.finish("fresh"); await pending; await settle(); });
    expect(runtime.owners.getView("host").sessionId).toBe("fresh");
  });

  it("akzeptiert unveränderte Bindung trotz Rerender und erhält frisch hinzugefügte Fremdfelder", async () => {
    const { result, rerender } = renderHook(() => useOrbitChat(true), { wrapper }); await act(settle);
    const held = hold(); let pending!: Promise<string>;
    act(() => { pending = result.current.createSession({ projectId: null }); }); await act(settle);
    rerender();
    act(() => useOrbitStore.getState().updateNode(current().id, { state: { ...current().state, newer: "keep-too" } }));
    await act(async () => { held.finish("current"); await pending; await settle(); });
    expect(current().state).toEqual({ hermesAdminPath: "/chat?resume=current", marker: "keep", newer: "keep-too" });
  });

  it("verwirft geänderte Startbindung schon vor dem Versand nach gehaltener Bereitschaft", async () => {
    gateway.autoOnline = false;
    const { result } = renderHook(() => useOrbitChat(true), { wrapper }); await act(settle);
    let pending!: Promise<string>;
    act(() => { pending = result.current.createSession({ projectId: null }); });
    const rejected = expect(pending).rejects.toMatchObject({ code: "OWNER_CHANGED", outcome: "not_sent" });
    act(() => changeHost("runtime"));
    await act(async () => { gateway.socket.online(); await rejected; await settle(); });
    expect(gateway.sent.filter((frame) => frame.op === "session.create")).toHaveLength(0);
    expect(runtime.owners.getView("host").sessionId).toBe("saved");
    expect(current().state.hermesAdminPath).toBe("/chat?resume=saved");
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
    const { result } = renderHook(() => useOrbitChat(true), { wrapper }); await act(settle);
    hold(); let pending!: Promise<string>;
    act(() => { pending = result.current.createSession({ projectId: null }); });
    const rejected = expect(pending).rejects.toMatchObject({ outcome: "unknown" });
    await act(settle);
    await act(async () => { await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs); await rejected; await settle(); });
    expect(result.current.unknownSend).toMatchObject({ operation: "session.create", canResend: false });
    expect(gateway.sent.filter((frame) => frame.op === "session.create")).toHaveLength(1);
    expect(current().state.hermesAdminPath).toBe("/chat?resume=saved");
  });
});
