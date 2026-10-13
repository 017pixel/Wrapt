// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { EdgeProps } from "@xyflow/react";
import { orbitNodeSchema, type OrbitEdge } from "@wrapt/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { OrbitEdgeView } from "./OrbitEdgeView";
import { useOrbitStore } from "../../stores/orbit";
import * as labels from "../../lib/orbitEdgeLabel";

vi.mock("../../lib/orbitEdgeLabel", { spy: true });
vi.mock("@xyflow/react", () => ({
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => children,
  useStore: (select: (state: { transform: number[] }) => unknown) => select({ transform: [0, 0, 1] }),
}));
const original = useOrbitStore.getState().document;
afterEach(() => { cleanup(); useOrbitStore.setState({ document: original }); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function seed(nodes: number, edges: number) {
  const board = original.boards[0]!;
  const items = Array.from({ length: nodes }, (_, index) => orbitNodeSchema.parse({
    id: `node-${index}`, type: "snippet", title: "Dummy", position: { x: -1_000 + (index % 30) * 300, y: -1_000 + Math.floor(index / 30) * 300 },
    size: { width: 200, height: 100 }, projectId: null, parentId: null, runtimeId: null, toolType: null,
    previewId: null, provider: null, content: "Text", language: null, locked: false, zIndex: index,
  }));
  const lines: OrbitEdge[] = Array.from({ length: edges }, (_, index) => ({
    id: `edge-${index}`, source: "node-0", target: "node-1", kind: "manual", label: "Linie", sourceSide: "right", targetSide: "left", waypoints: [],
  }));
  useOrbitStore.setState({ document: { ...original, activeBoardId: board.id, boards: [{ ...board, nodes: items, edges: lines }] } });
  return lines;
}
function props(edge: OrbitEdge, selected = false): EdgeProps {
  return { id: edge.id, source: edge.source, target: edge.target, sourceX: 0, sourceY: 0, targetX: 300, targetY: 100, selected,
    sourcePosition: "right", targetPosition: "left", data: { orbit: edge, color: "var(--color-accent)" } } as EdgeProps;
}

it.each([[100, 200], [600, 1_200]])("registriert bei %i Nodes/%i Edges keine Idle-Pointerlistener und berechnet bei Content null Labels", (nodes, edges) => {
  const lines = seed(nodes, edges);
  const listen = vi.spyOn(window, "addEventListener");
  const calculate = vi.mocked(labels.collisionFreeEdgeLabelPoint);
  calculate.mockClear();
  const view = render(<>{lines.map((edge) => <OrbitEdgeView key={edge.id} {...props(edge)} />)}</>);
  expect(calculate).toHaveBeenCalledTimes(edges);
  expect(listen.mock.calls.filter(([type]) => ["pointermove", "pointerup"].includes(type))).toHaveLength(0);
  calculate.mockClear();
  act(() => useOrbitStore.setState((state) => ({ document: { ...state.document, boards: state.document.boards.map((board) => ({
    ...board, nodes: board.nodes.map((node) => ({ ...node, content: "Neuer Text", title: "Neu" })),
  })) } })));
  // Auch neu erzeugte Flowdaten nach Contentupdates behalten die Labelmemoisierung.
  view.rerender(<>{lines.map((edge) => <OrbitEdgeView key={edge.id} {...props({ ...edge })} />)}</>);
  expect(calculate).not.toHaveBeenCalled();
  act(() => useOrbitStore.setState((state) => ({ document: { ...state.document, boards: state.document.boards.map((board) => ({
    ...board, nodes: board.nodes.map((node, index) => index === 0 ? { ...node, position: { x: 50, y: 50 } } : node),
  })) } })));
  expect(calculate).toHaveBeenCalledTimes(edges);
});

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, options: PointerEventInit = {}) { super(type, options); this.pointerId = options.pointerId ?? 1; }
}

it("hält Pointercapture und Controlidentität beim Drag, committtet nur bei Up und entfernt Listener", () => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  const edge = seed(2, 1)[0]!;
  const update = vi.spyOn(useOrbitStore.getState(), "updateEdge");
  const view = render(<OrbitEdgeView {...props(edge, true)} />);
  const button = view.getByRole("button", { name: "Linienpunkt 1 verschieben" });
  const capture = vi.fn();
  button.setPointerCapture = capture;
  const listen = vi.spyOn(window, "addEventListener");
  const remove = vi.spyOn(window, "removeEventListener");
  fireEvent.pointerDown(button, { pointerId: 4, clientX: 50, clientY: 0 });
  expect(capture).toHaveBeenCalledWith(4);
  fireEvent.pointerMove(window, { pointerId: 4, clientX: 70, clientY: 30 });
  expect(view.getByRole("button", { name: "Linienpunkt 1 verschieben" })).toBe(button);
  expect(update).not.toHaveBeenCalled();
  fireEvent.pointerUp(window, { pointerId: 4 });
  expect(update).toHaveBeenCalledOnce();
  expect(listen.mock.calls.filter(([type]) => type === "pointermove")).toHaveLength(1);
  expect(remove.mock.calls.filter(([type]) => type === "pointermove")).toHaveLength(1);
});

it.each(["pointercancel", "Escape", "lostpointercapture"])("verwirft den transienten Drag bei %s ohne Save", (cancel) => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  const edge = seed(2, 1)[0]!;
  const update = vi.spyOn(useOrbitStore.getState(), "updateEdge");
  const view = render(<OrbitEdgeView {...props(edge, true)} />);
  const button = view.getByRole("button", { name: "Linienpunkt 1 verschieben" });
  fireEvent.pointerDown(button, { pointerId: 4, clientX: 50, clientY: 0 });
  fireEvent.pointerMove(window, { pointerId: 4, clientX: 70, clientY: 30 });
  if (cancel === "Escape") fireEvent.keyDown(window, { key: "Escape" });
  else fireEvent(cancel === "pointercancel" ? window : button, new TestPointerEvent(cancel, { pointerId: 4, bubbles: true }));
  fireEvent.pointerUp(window, { pointerId: 4 });
  expect(update).not.toHaveBeenCalled();
});
