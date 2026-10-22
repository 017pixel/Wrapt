// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useHermesV2SidebarWidth } from "./useHermesV2SidebarWidth";

function Fixture() {
  const root = useRef<HTMLDivElement>(null);
  const layout = useHermesV2SidebarWidth(root, true);
  return <div ref={root} style={{ zoom: .8 }}><div {...layout.separatorProps} /></div>;
}
const key = "wrapt.hermes-v2.sidebar-layout.v1";
function pointer(type: string, x: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, button: { value: 0 }, clientX: { value: x } });
  return event;
}
afterEach(() => { cleanup(); localStorage.clear(); document.body.style.cursor = ""; document.body.style.userSelect = ""; });
describe("Ziehbare Hermes-Sidebar", () => {
  it("rechnet Pointerbewegungen bei 80 Prozent Zoom um und speichert die Breite", () => {
    render(<Fixture />);
    const handle = screen.getByRole("separator");
    document.body.style.cursor = "crosshair";
    act(() => { handle.dispatchEvent(pointer("pointerdown", 200)); window.dispatchEvent(pointer("pointermove", 280)); window.dispatchEvent(pointer("pointerup", 280)); });
    expect(handle.getAttribute("aria-valuenow")).toBe("372");
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, width: 372 });
    expect(document.body.style.cursor).toBe("crosshair");
    expect(document.body.style.userSelect).toBe("");
  });
  it("begrenzt Tastaturänderungen und stellt per Doppelklick den Standard wieder her", () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, width: 470 }));
    render(<Fixture />);
    const handle = screen.getByRole("separator");
    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(handle.getAttribute("aria-valuenow")).toBe("480");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle.getAttribute("aria-valuenow")).toBe("264");
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("272");
  });
  it("beendet Ziehen bei Fokusverlust und entfernt globale Listener", () => {
    render(<Fixture />); const handle = screen.getByRole("separator");
    act(() => { handle.dispatchEvent(pointer("pointerdown", 200)); window.dispatchEvent(pointer("pointermove", 240)); window.dispatchEvent(new Event("blur")); });
    const width = handle.getAttribute("aria-valuenow");
    act(() => { window.dispatchEvent(pointer("pointermove", 400)); });
    expect(handle.getAttribute("aria-valuenow")).toBe(width);
    expect(document.body.style.userSelect).toBe("");
  });
});
