// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orbitWorkspaceSchema, type OrbitNode, type Panel } from "@wrapt/contracts";
import { freshOrbitWorkspace, useOrbitStore } from "../../stores/orbit";
import { nodeFromInput } from "../../stores/orbitNodeFactory";
import { RouteActivityProvider } from "../../lib/routeActivity";
import { OrbitToolContent } from "./OrbitToolContent";

const tool = vi.hoisted(() => ({ props: null as null | {
  panel: Panel; terminalRuntimeId: string | null; terminalRenderScale: number;
  onHermesPathChange?: (path: string) => void; onFocus: () => void;
} }));
vi.mock("../ToolPanel", () => ({ ToolPanel: (props: NonNullable<typeof tool.props>) => { tool.props = props; return null; } }));

function node(id: string, path?: string): OrbitNode {
  return { ...nodeFromInput({ type: "tool", toolType: "hermes", title: id, position: { x: 0, y: 0 } }, 1),
    id, runtimeId: "shared-terminal-id", state: { ownMarker: "erhalten", ...(path ? { hermesAdminPath: path } : {}) } };
}
function current(id = "host-a") {
  const { document } = useOrbitStore.getState();
  return document.boards.find((board) => board.id === document.activeBoardId)!.nodes.find((entry) => entry.id === id)!;
}
function Harness({ id = "host-a", selected = true, active = true }: { id?: string; selected?: boolean; active?: boolean }) {
  const document = useOrbitStore((state) => state.document);
  const host = document.boards.find((board) => board.id === document.activeBoardId)!.nodes.find((entry) => entry.id === id)!;
  return <RouteActivityProvider active={active}><OrbitToolContent node={host} project={undefined}
    services={[]} selected={selected} zoom={0.75} onFocus={() => undefined} /></RouteActivityProvider>;
}
function callback() { return tool.props!.onHermesPathChange!; }
function change(patch: Partial<OrbitNode>) { useOrbitStore.getState().updateNode("host-a", patch); }

beforeEach(() => {
  const document = freshOrbitWorkspace();
  const first = { ...document.boards[0]!, nodes: [node("host-a", "/chat?resume=saved"), node("host-b", "/chat?resume=other")] };
  const second = { ...first, id: "second-board", nodes: first.nodes.map((entry) => ({ ...entry, state: { ...entry.state } })) };
  useOrbitStore.setState({ document: { ...document, boards: [first, second] }, hydrated: true, dirty: false });
});
afterEach(cleanup);

describe("Hermesauswahl im genauen Orbitknoten", () => {
  it("schreibt volle ausgewählte/erstellte ID und Reset in node.state und liest den gespeicherten Stand erneut", () => {
    const other = current("host-b");
    const before = current();
    const { unmount } = render(<Harness />);
    expect(tool.props!.panel.id).toBe("host-a");
    expect(tool.props!.panel.hermesAdminPath).toBe("/chat?resume=saved");
    act(() => callback()("/chat?resume=created%2Ffull-id"));
    expect(current()).toEqual({ ...before, state: { ...before.state, hermesAdminPath: "/chat?resume=created%2Ffull-id" } });
    expect(current("host-b")).toBe(other);
    expect(useOrbitStore.getState().dirty).toBe(true);
    const stored = orbitWorkspaceSchema.parse(JSON.parse(JSON.stringify(useOrbitStore.getState().document)));
    unmount();
    useOrbitStore.setState({ document: stored });
    render(<Harness />);
    expect(tool.props!.panel.hermesAdminPath).toBe("/chat?resume=created%2Ffull-id");
    act(() => callback()("/chat"));
    expect(current().state).toEqual({ ownMarker: "erhalten", hermesAdminPath: "/chat" });
  });

  it("mischt die Auswahl in aktuellste fremde Felder statt in alten Renderstate", () => {
    render(<Harness />);
    const held = callback();
    act(() => change({ state: { ...current().state, later: { keep: true } } }));
    act(() => held("/chat?resume=new"));
    expect(current().state).toEqual({ ownMarker: "erhalten", later: { keep: true }, hermesAdminPath: "/chat?resume=new" });
  });

  it("verhindert altes Überschreiben sofort nach einer neueren Auswahl", () => {
    render(<Harness />);
    const old = callback();
    act(() => { old("/chat?resume=first"); old("/chat?resume=stale-second"); });
    expect(current().state.hermesAdminPath).toBe("/chat?resume=first");
    act(() => callback()("/chat?resume=current"));
    expect(current().state.hermesAdminPath).toBe("/chat?resume=current");
  });

  it.each(["board", "runtime", "project", "type", "path"] as const)("entwertet alte Referenzen bei beobachtetem %s-A-B-A auch ohne Zwischenrender", (kind) => {
    render(<Harness />);
    const held = callback();
    const original = current();
    act(() => {
      const store = useOrbitStore.getState();
      if (kind === "board") {
        const boardId = store.document.activeBoardId;
        store.activateBoard("second-board"); store.activateBoard(boardId);
      } else if (kind === "runtime") {
        change({ runtimeId: "other-runtime" }); change({ runtimeId: original.runtimeId });
      } else if (kind === "project") {
        change({ projectId: "other-project" }); change({ projectId: original.projectId });
      } else if (kind === "type") {
        change({ toolType: "terminal" }); change({ toolType: "hermes" });
      } else {
        change({ state: { ...original.state, hermesAdminPath: "/chat?resume=temporary" } });
        change({ state: original.state });
      }
      held("/chat?resume=stale");
    });
    expect(current().state.hermesAdminPath).toBe("/chat?resume=saved");
    act(() => callback()("/chat?resume=valid-current"));
    expect(current().state.hermesAdminPath).toBe("/chat?resume=valid-current");
  });

  it("isoliert genaue Node-ID trotz gleicher Runtime und verwirft alten Callback nach Node-A-B-A", () => {
    const { rerender } = render(<Harness />);
    const old = callback();
    rerender(<Harness id="host-b" />);
    expect(tool.props!.panel.id).toBe("host-b");
    act(() => callback()("/chat?resume=b-new"));
    expect(current("host-b").state.hermesAdminPath).toBe("/chat?resume=b-new");
    expect(current().state.hermesAdminPath).toBe("/chat?resume=saved");
    rerender(<Harness />);
    act(() => old("/chat?resume=stale"));
    expect(current().state.hermesAdminPath).toBe("/chat?resume=saved");
  });

  it.each(["hidden", "unselected"] as const)("sperrt %s und alte Referenzen nach Rückkehr", (kind) => {
    const { rerender, unmount } = render(<Harness />);
    const old = callback();
    rerender(<Harness active={kind !== "hidden"} selected={kind !== "unselected"} />);
    act(() => { callback()("/settings"); old("/settings"); });
    rerender(<Harness />);
    act(() => old("/settings"));
    expect(current().state.hermesAdminPath).toBe("/chat?resume=saved");
    const unmounted = callback(); unmount(); unmounted("/settings");
    expect(current().state.hermesAdminPath).toBe("/chat?resume=saved");
  });

  it.each([{}, { hermesAdminPath: "https://foreign.test" }, { hermesAdminPath: "/" + "x".repeat(2_048) }])("öffnet Legacy oder beschädigte Metadaten %j bei /chat", (state) => {
    change({ state });
    render(<Harness />);
    expect(tool.props!.panel.hermesAdminPath).toBe("/chat");
    act(() => callback()("https://foreign.test/chat"));
    expect(current().state).toEqual(state);
  });

  it("lässt unveränderte Bindung und aktuellen externen Hostpfad weiter bedienbar", () => {
    const { rerender } = render(<Harness />);
    const same = callback(); rerender(<Harness />);
    act(() => same("/settings"));
    expect(current().state.hermesAdminPath).toBe("/settings");
    act(() => change({ state: { ownMarker: "neu", hermesAdminPath: "/chat?resume=external" } }));
    expect(tool.props!.panel.hermesAdminPath).toBe("/chat?resume=external");
    act(() => callback()("/chat?resume=external-next"));
    expect(current().state.ownMarker).toBe("neu");
  });

  it("erhält Identität und Übergaben anderer Orbitwerkzeuge", () => {
    change({ toolType: "terminal" });
    render(<Harness />);
    expect(tool.props!.panel.id).toBe("shared-terminal-id");
    expect(tool.props!.terminalRuntimeId).toBe("shared-terminal-id");
    expect(tool.props!.terminalRenderScale).toBe(0.75);
    expect(tool.props!.onHermesPathChange).toBeUndefined();
  });
});
