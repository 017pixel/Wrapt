// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2SidebarPanel } from "./HermesV2Sidebar";
import { makeGroup, makeMetadata, makeRow, makeSidebar } from "./sidebar-test-fixtures";

function setup() {
  const sidebar = makeSidebar({ groups: [makeGroup("needs-input", [makeRow({
    id: "s1", title: "Eine Aufgabe", group: "needs-input", attentionKind: "live-turn-end",
    metadata: makeMetadata({ attention: { unreadCount: 1, requiresAttention: true,
      latest: { id: "f1", kind: "live-turn-end", unread: true, relevant: true, observedAt: 1000, completedAt: 1000 } } }),
  })])] });
  const select = vi.fn();
  const view = render(<HermesV2SidebarPanel sidebar={sidebar} activeSessionId={null} onSelect={select} onCreate={vi.fn()} />);
  return { sidebar, select, ...view, row: screen.getByRole("button", { name: "Eine Aufgabe" }) };
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Sitzungsaktionen ohne Drei-Punkte-Menü", () => {
  it("öffnet per Rechtsklick am Zeiger, ohne den Chat auszuwählen oder eine Aktion auszuführen", () => {
    const { row, sidebar, select } = setup();
    fireEvent.contextMenu(row, { clientX: 180, clientY: 300 });
    expect(screen.getByRole("menu").style.left).toBe("180px");
    expect(screen.getByRole("menu").style.top).toBe("300px");
    expect(select).not.toHaveBeenCalled();
    expect(sidebar.calls.organize).toEqual([]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Erledigen" }));
    expect(sidebar.calls.organize).toHaveLength(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("bedient das Menü mit Umschalt+F10, Pfeiltasten und Escape und gibt den Fokus zurück", () => {
    const { row } = setup();
    row.focus();
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    const first = screen.getByRole("menuitem", { name: "Sitzungsdetails" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Anheften" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("trennt Linksklick und die Erledigen-Aktion", () => {
    const { row, select, sidebar } = setup();
    fireEvent.click(row);
    expect(select).toHaveBeenCalledExactlyOnceWith("s1");
    expect(sidebar.calls.organize).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Sitzung erledigen" }));
    expect(select).toHaveBeenCalledTimes(1);
    expect(sidebar.calls.organize).toHaveLength(1);
  });

  it("zeigt Metadaten verzögert beim Hover und lässt das Lesen der Vorschau zu", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { row, container } = setup();
    expect(container.textContent).not.toContain("prov");
    fireEvent.pointerEnter(row.closest("li")!);
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("prov · m");
    expect(tooltip.textContent).toContain("Turn beendet");
    expect(row.getAttribute("aria-describedby")).toBe(tooltip.id);
    fireEvent.pointerLeave(row.closest("li")!);
    fireEvent.pointerEnter(tooltip);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("tooltip")).toBe(tooltip);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("verwirft Vorschauen vorzeitig verlassener Zeilen", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { row } = setup();
    fireEvent.pointerEnter(row.closest("li")!);
    fireEvent.pointerLeave(row.closest("li")!);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("öffnet dieselben Details auf Touch über Aktionen", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { row } = setup();
    fireEvent.pointerEnter(row.closest("li")!);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aktionen für Eine Aufgabe" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sitzungsdetails" }));
    expect(screen.getByRole("tooltip").textContent).toContain("prov · m");
  });
});
