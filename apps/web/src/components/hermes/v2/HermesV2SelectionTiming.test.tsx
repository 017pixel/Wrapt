// @vitest-environment jsdom
import { StrictMode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { projectsApi } from "../../../lib/apiClient/projects";
import { useAppPreferences } from "../../../stores/appPreferences";
import { useLayoutStore } from "../../../stores/layout";
import { stubHermesViewport } from "../../../test/hermesViewport";
import { HermesV2Shell } from "./HermesV2Shell";
import * as runtimes from "./chat-runtime";
import { TestGateway, type TestSocket, settle, snapshot } from "./chat-test-fixtures";
import { makeGroup, makeRow, makeSidebar } from "./sidebar-test-fixtures";

vi.mock("./useHermesV2Sidebar", () => ({ useHermesV2Sidebar: () => makeSidebar({
  groups: [makeGroup("active", [makeRow({ id: "saved", title: "Bisherige Sitzung" }),
    makeRow({ id: "other", title: "Andere Sitzung" })])],
}) }));
// Darstellung reduziert; echte Sidebarzeile, Dialog, Auswahl und Runtime bleiben erhalten.
vi.mock("./HermesV2ChatSurface", () => ({ HermesV2ChatSurface: () => null }));
vi.mock("../../terminal/TerminalArea", () => ({ TerminalArea: () => null }));

type Kind = "route" | "standalone" | "panel";
let gateway: TestGateway;
let runtime: runtimes.ChatRuntime;
let client: QueryClient;
let creation: Promise<string> | undefined;
const ownId = (kind: Kind) => kind === "route" ? "hermes-route" : kind === "standalone"
  ? "hermes-standalone" : "hermes-panel-host-node";

function Panel() {
  const panel = useLayoutStore((state) => state.panels[0]!);
  return <HermesV2Shell variant="panel" panel={panel} active />;
}
function Location() { return <output data-testid="selection-url">{useLocation().search}</output>; }
function Tree({ kind }: { kind: Kind }) {
  return <StrictMode><QueryClientProvider client={client}>
    <MemoryRouter initialEntries={["/hermes-v2?session=saved&keep=yes"]}>
      {kind === "panel" ? <Panel /> : <HermesV2Shell variant="route" standalone={kind === "standalone"} />}
      <Location />
    </MemoryRouter>
  </QueryClientProvider></StrictMode>;
}
function row(id: string) {
  return document.querySelector<HTMLButtonElement>(`[data-session-id="${id}"] .hermesv2-rowselect`)!;
}
function hostSelection(kind: Kind) {
  if (kind === "panel") return useLayoutStore.getState().panels[0]!.hermesAdminPath;
  return new URLSearchParams(screen.getByTestId("selection-url").textContent!).get("session");
}
function expectedHost(kind: Kind, id: string) {
  return kind === "panel" ? `/chat?resume=${id}` : id;
}
function holdCreate() {
  let request: HermesV2ClientMessage;
  let socket: TestSocket;
  gateway.handle = (frame, connection) => {
    if (frame.op !== "session.create") return false;
    request = frame; socket = connection; return true;
  };
  return (id: string) => socket.result(request, { snapshot: snapshot(id) });
}
async function createClick() {
  fireEvent.click(document.querySelector<HTMLButtonElement>(".hermesv2-new-session")!);
  await act(async () => { await settle(); await vi.advanceTimersByTimeAsync(0); });
  fireEvent.click(screen.getByRole("button", { name: "Sitzung erstellen" }));
  await act(settle);
  expect(creation).toBeDefined();
}
beforeEach(async () => {
  vi.useFakeTimers();
  stubHermesViewport(1440, 900);
  useAppPreferences.setState({ hermesV2Enabled: true });
  gateway = new TestGateway(); runtime = new runtimes.ChatRuntime(gateway.createClient());
  vi.spyOn(runtimes, "getChatRuntime").mockReturnValue(runtime);
  const actionsFor = runtime.actionsFor.bind(runtime);
  vi.spyOn(runtime, "actionsFor").mockImplementation((ownerId) => {
    const actions = actionsFor(ownerId);
    return { ...actions, createSession: (options) => {
      creation = actions.createSession(options); return creation;
    } };
  });
  vi.spyOn(projectsApi, "projects").mockResolvedValue({ projects: [], projectsRoot: "/synthetic", recentLimit: 10 });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  useLayoutStore.setState({ panels: [{ id: "host-node", type: "hermes", projectId: null, previewId: null,
    reloadKey: 0, hermesAdminPath: "/chat?resume=saved" }] });
  creation = undefined;
  await import("../HermesShell");
});
afterEach(async () => {
  await act(async () => {
    cleanup(); client.clear(); await settle(); runtime.dispose("v2-disabled"); await settle();
    await vi.runOnlyPendingTimersAsync();
  });
  expect(gateway.sockets.every((socket) => socket.readyState === 3)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  useAppPreferences.setState({ hermesV2Enabled: false });
  useLayoutStore.getState().resetLayout();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("Bewusste echte Zeilenauswahl vor passiven Effects", () => {
  // Der Test wartet auf eine echte Create-Antwort ueber das Gateway. Im
  // parallelen Gesamtlauf reicht die Standardfrist von fuenf Sekunden nicht.
  const CREATE_TIMEOUT = 30_000;

  it.each(["route", "standalone", "panel"] as const)("bewahrt %s bei unmittelbar folgender Createantwort und erlaubt aktuelle Erstellung", async (kind) => {
    render(<Tree kind={kind} />); await act(settle);
    const id = ownId(kind);
    const foreign = vi.fn();
    runtime.acquire({ ownerId: "foreign", sessionId: "foreign", active: true, onSelectSession: foreign });
    act(() => runtime.actionsFor(id).setDraft("Bisheriger Entwurf"));
    const confirm = holdCreate();
    const seed = vi.spyOn(runtime, "seed");
    await createClick();
    fireEvent.keyDown(document, { key: "Escape" });
    let selectedAtClick: string | null = null;
    // Das echte Clickbubbling erreicht document nach Reacts Zeilenhandler.
    // Das ACK wird dort vor jedem anschließenden passiven Effect geliefert.
    const receive = (event: MouseEvent) => {
      if (event.target !== row("other")) return;
      selectedAtClick = runtime.owners.getView(id).sessionId;
      runtime.actionsFor(id).setDraft("Aktueller Auswahlentwurf");
      confirm("late-created");
    };
    document.addEventListener("click", receive);
    try {
      await act(async () => { row("other").click(); expect(await creation).toBe("late-created"); await settle(); });
    } finally { document.removeEventListener("click", receive); }
    expect(selectedAtClick).toBe("other");
    expect(hostSelection(kind)).toBe(expectedHost(kind, "other"));
    expect(runtime.owners.getView(id)).toMatchObject({ sessionId: "other", draft: "Aktueller Auswahlentwurf" });
    expect(seed).not.toHaveBeenCalled();
    expect(runtime.sessionIsLeased("late-created")).toBe(false);
    expect(runtime.owners.getView("foreign").sessionId).toBe("foreign");
    expect(foreign).not.toHaveBeenCalled();
    expect(gateway.sent.filter((frame) => frame.op === "session.unsubscribe" && frame.sessionId === "late-created")).toHaveLength(1);
    fireEvent.click(row("saved")); await act(settle);
    expect(runtime.owners.getView(id).draft).toBe("Bisheriger Entwurf");
    const fresh = holdCreate();
    await createClick();
    await act(async () => { fresh("fresh-created"); expect(await creation).toBe("fresh-created"); await settle(); });
    expect(hostSelection(kind)).toBe(expectedHost(kind, "fresh-created"));
    expect(runtime.owners.getView(id).sessionId).toBe("fresh-created");
    expect(gateway.sent.filter((frame) => frame.op === "session.create")).toHaveLength(2);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
    expect(new URLSearchParams(screen.getByTestId("selection-url").textContent!).get("keep")).toBe("yes");
  }, CREATE_TIMEOUT);

  it.each(["route", "standalone", "panel"] as const)("behält gute aktuelle Erstellung in %s ohne Zeilenwechsel", async (kind) => {
    render(<Tree kind={kind} />); await act(settle);
    const confirm = holdCreate();
    await createClick();
    await act(async () => { confirm("current-created"); expect(await creation).toBe("current-created"); await settle(); });
    expect(hostSelection(kind)).toBe(expectedHost(kind, "current-created"));
    expect(runtime.owners.getView(ownId(kind)).sessionId).toBe("current-created");
    expect(gateway.sent.filter((frame) => frame.op === "session.create")).toHaveLength(1);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
  }, CREATE_TIMEOUT);
});
