// @vitest-environment jsdom
import { useEffect } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { TerminalPaneLayout } from "@wrapt/contracts";
import { TerminalCanvas, type TerminalCanvasPane } from "./TerminalCanvas";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function canvas(layout: TerminalPaneLayout, panes: TerminalCanvasPane[]) {
  return <TerminalCanvas
    areaId="standalone"
    bento={false}
    isMobile={false}
    showSingleMobilePane={false}
    focusedRuntimeId={panes.at(-1)?.runtimeId ?? null}
    paneLayout={layout}
    panes={panes}
    parkedPanes={[]}
    emptyState={null}
    dropZone={null}
    renderPane={(pane) => <div data-testid={pane.runtimeId}>{pane.runtimeId}</div>}
    onLayoutChanged={vi.fn()}
  />;
}

test("behält das linke Terminal beim Wechsel von Einzelansicht zu Split im DOM", () => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  const left = { type: "pane" as const, id: "pane-left", runtimeId: "runtime-left" };
  const right = { type: "pane" as const, id: "pane-right", runtimeId: "runtime-right" };
  const single: TerminalPaneLayout = left;
  const split: TerminalPaneLayout = { type: "split", id: "split-main", orientation: "horizontal", children: [left, right], sizes: [50, 50] };
  const view = render(canvas(single, [left]));
  const originalNode = view.getByTestId("runtime-left");

  view.rerender(canvas(split, [left, right]));

  expect(view.getByTestId("runtime-left")).toBe(originalNode);
  expect(view.getByTestId("runtime-right")).toBeTruthy();
});

test("bewahrt beide mobilen Split-Renderer beim Fokuswechsel", () => {
  const mounted = vi.fn();
  const unmounted = vi.fn();
  function Pane({ id, visible }: { id: string; visible: boolean }) {
    useEffect(() => { mounted(id); return () => unmounted(id); }, [id]);
    return <div data-testid={id} hidden={!visible}>{id}</div>;
  }
  const panes = [{ id: "one", runtimeId: "runtime-one" }, { id: "two", runtimeId: "runtime-two" }];
  const props = {
    areaId: "standalone", bento: false, isMobile: true, showSingleMobilePane: true,
    paneLayout: { type: "split" as const, id: "split", orientation: "horizontal" as const, children: panes.map((pane) => ({ type: "pane" as const, ...pane })), sizes: [50, 50] },
    panes, parkedPanes: [], emptyState: null, dropZone: null,
    renderPane: (pane: typeof panes[number], visible: boolean) => <Pane key={pane.id} id={pane.id} visible={visible} />,
    onLayoutChanged: vi.fn(),
  };
  const view = render(<TerminalCanvas {...props} focusedRuntimeId="runtime-one" />);
  expect(view.getByTestId("one").hidden).toBe(false);
  expect(view.getByTestId("two").hidden).toBe(true);
  view.rerender(<TerminalCanvas {...props} focusedRuntimeId="runtime-two" />);
  expect(view.getByTestId("one").hidden).toBe(true);
  expect(view.getByTestId("two").hidden).toBe(false);
  expect(mounted).toHaveBeenCalledTimes(2);
  expect(unmounted).not.toHaveBeenCalled();
});
