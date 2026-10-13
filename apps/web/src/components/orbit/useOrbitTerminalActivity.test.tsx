// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useOrbitTerminalActivity } from "./useOrbitTerminalActivity";

let report: IntersectionObserverCallback;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Fixture({ routeActive, ready }: { routeActive: boolean; ready: boolean }) {
  const mount = useRef<HTMLDivElement>(null);
  const active = useOrbitTerminalActivity(mount, routeActive, ready);
  return <div className="orbit-flow"><div className="react-flow__node-orbit">
    <div ref={mount} data-testid="terminal" data-active={active} />
  </div></div>;
}

it("wartet den ersten vollständigen Sync ab und erhält beim Parken denselben DOM", () => {
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { report = callback; }
    observe() {} unobserve() {} disconnect() {}
  });
  const view = render(<Fixture routeActive ready={false} />);
  const terminal = view.getByTestId("terminal");
  const node = terminal.parentElement!;
  act(() => report([{ target: node, isIntersecting: false } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
  expect(terminal.dataset.active).toBe("true");
  view.rerender(<Fixture routeActive ready />);
  expect(terminal.dataset.active).toBe("false");
  act(() => report([{ target: node, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
  expect(terminal.dataset.active).toBe("true");
  expect(view.getByTestId("terminal")).toBe(terminal);
  view.rerender(<Fixture routeActive={false} ready={false} />);
  expect(terminal.dataset.active).toBe("false");
});

it("behält ohne IntersectionObserver die bisherige Routenaktivität", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const view = render(<Fixture routeActive ready />);
  expect(view.getByTestId("terminal").dataset.active).toBe("true");
  view.rerender(<Fixture routeActive={false} ready />);
  expect(view.getByTestId("terminal").dataset.active).toBe("false");
});
