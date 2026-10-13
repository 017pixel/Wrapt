// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { observeOrbitTerminal } from "./terminalVisibility";

let intersection: (entries: IntersectionObserverEntry[]) => void;
const observe = vi.fn();
const disconnect = vi.fn();
const constructors = vi.fn();
const releases: (() => void)[] = [];

function fixture() {
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof intersection, options: IntersectionObserverInit) {
      intersection = callback;
      constructors(options);
    }
    observe = observe;
    unobserve = vi.fn();
    disconnect = disconnect;
  });
  const root = document.createElement("div");
  root.className = "orbit-flow";
  const nodes = Array.from({ length: 2 }, () => {
    const node = document.createElement("div");
    node.className = "react-flow__node-orbit";
    const input = document.createElement("input");
    node.append(input);
    root.append(node);
    return { node, input };
  });
  document.body.append(root);
  return { root, nodes };
}

function visible(node: HTMLElement, value: boolean) {
  intersection([{ target: node, isIntersecting: value } as unknown as IntersectionObserverEntry]);
}

afterEach(() => {
  releases.splice(0).forEach(release => release());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("teilt einen Overscanindex und erhält entfernten DOM beim Parken", () => {
  const { root, nodes } = fixture();
  const a = vi.fn(), b = vi.fn();
  releases.push(observeOrbitTerminal(nodes[0]!.input, a), observeOrbitTerminal(nodes[1]!.input, b));
  expect(constructors).toHaveBeenCalledOnce();
  expect(constructors).toHaveBeenCalledWith({ root, rootMargin: "640px" });
  expect(observe).toHaveBeenCalledTimes(2);
  visible(nodes[1]!.node, false);
  expect(b).toHaveBeenLastCalledWith(false);
  expect(root.children).toHaveLength(2);
  visible(nodes[1]!.node, true);
  expect(b).toHaveBeenLastCalledWith(true);
});

it("hält Fokus, Auswahl und Drag aktiv und löst sie nach Cancel wieder", async () => {
  const { nodes } = fixture();
  const { node, input } = nodes[0]!;
  const listener = vi.fn();
  releases.push(observeOrbitTerminal(input, listener));
  visible(node, false);
  input.focus();
  await Promise.resolve();
  expect(listener).toHaveBeenLastCalledWith(true);
  input.blur();
  await Promise.resolve();
  expect(listener).toHaveBeenLastCalledWith(false);
  node.classList.add("selected");
  await Promise.resolve();
  expect(listener).toHaveBeenLastCalledWith(true);
  node.classList.remove("selected");
  await Promise.resolve();
  expect(listener).toHaveBeenLastCalledWith(false);
  const down = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(down, "pointerId", { value: 1 });
  input.dispatchEvent(down);
  expect(listener).toHaveBeenLastCalledWith(true);
  const cancel = new Event("pointercancel");
  Object.defineProperty(cancel, "pointerId", { value: 1 });
  window.dispatchEvent(cancel);
  expect(listener).toHaveBeenLastCalledWith(false);
});

it("räumt nach letztem Verbraucher auf und lässt normale Terminals unverändert", () => {
  const { nodes } = fixture();
  const a = observeOrbitTerminal(nodes[0]!.input, vi.fn());
  const b = observeOrbitTerminal(nodes[0]!.input, vi.fn());
  a();
  expect(disconnect).not.toHaveBeenCalled();
  b();
  expect(disconnect).toHaveBeenCalledOnce();
  const standalone = document.createElement("input");
  document.body.append(standalone);
  const listener = vi.fn();
  observeOrbitTerminal(standalone, listener)();
  expect(listener).not.toHaveBeenCalled();
});
