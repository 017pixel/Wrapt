// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrbitBoard } from "@wrapt/contracts";
import { OrbitBoardSwitcher } from "./OrbitBoardSwitcher";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; }));

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}) } as DOMRect;
}

function board(id: string, name: string): OrbitBoard {
  return {
    id,
    name,
    viewport: { x: 0, y: 0, zoom: 1 },
    worldBounds: { minX: -1_000, minY: -1_000, maxX: 1_000, maxY: 1_000 },
    nodes: [],
    edges: [],
  };
}

describe("OrbitBoardSwitcher", () => {
  it("zeigt geschlossen nur den aktiven Namen und öffnet ein zugängliches Menü", () => {
    const boards = [board("team", "Team"), board("ideen", "Ideen")];
    render(<OrbitBoardSwitcher boards={boards} activeBoardId="team" onSelect={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Arbeitsfläche: Team" });
    expect(trigger.textContent).toContain("Team");
    expect(trigger.textContent).not.toMatch(/1 von 2|Knoten|Verbindungen/);
    fireEvent.click(trigger);

    expect(screen.getByRole("menu", { name: "Arbeitsfläche auswählen" })).toBeTruthy();
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(2);
  });

  it("unterstützt Tastaturwechsel, Escape und Auswahl", async () => {
    const boards = [board("team", "Team"), board("ideen", "Ideen")];
    const onSelect = vi.fn();
    render(<OrbitBoardSwitcher boards={boards} activeBoardId="team" onSelect={onSelect} />);
    const trigger = screen.getByRole("button", { name: "Arbeitsfläche: Team" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const items = screen.getAllByRole("menuitemradio");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ideen/ }));
    expect(onSelect).toHaveBeenCalledWith("ideen");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("rendert das Menü außerhalb der Toolbar und klemmt es an den Viewport", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 250 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 480 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("orbit-board-picker-trigger")) return rect(230, 420, 20, 40);
      if (this.classList.contains("orbit-board-picker-menu")) return rect(0, 0, 226, 200);
      return rect(0, 0, 0, 0);
    });

    try {
      render(<OrbitBoardSwitcher boards={[board("team", "Team")]} activeBoardId="team" onSelect={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Arbeitsfläche: Team" }));

      const menu = screen.getByRole("menu", { name: "Arbeitsfläche auswählen" });
      expect(menu.parentElement).toBe(document.body);
      expect(menu.style.position).toBe("fixed");
      expect(menu.style.width).toBe("226px");
      expect(menu.style.left).toBe("12px");
      expect(menu.style.top).toBe("213px");

      fireEvent.pointerDown(menu);
      expect(screen.getByRole("menu", { name: "Arbeitsfläche auswählen" })).toBeTruthy();
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });
});
