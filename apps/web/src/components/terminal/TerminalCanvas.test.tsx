// @vitest-environment jsdom
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
