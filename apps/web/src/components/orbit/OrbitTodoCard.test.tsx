// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeOrbitTodo } from "../../lib/orbitTodo";
import { OrbitTodoCard } from "./OrbitTodoCard";

const mocks = vi.hoisted(() => ({ updateNode: vi.fn() }));

vi.mock("../../stores/orbit", () => ({
  useOrbitStore: (auswahl: (zustand: { updateNode: unknown }) => unknown) =>
    auswahl({ updateNode: mocks.updateNode }),
}));

const inhalt = serializeOrbitTodo([
  { id: "a1", text: "Erste Aufgabe", done: false },
  { id: "a2", text: "Zweite Aufgabe", done: true },
]);

describe("OrbitTodoCard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("Löschen braucht erst Confirm, erst dann läuft saveItems", async () => {
    render(<OrbitTodoCard id="knoten-1" title="Wochenplan" content={inhalt} />);

    fireEvent.click(screen.getByRole("button", { name: "Aufgabe 1 löschen" }));
    // Dialog steht, aber noch nichts gespeichert.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(mocks.updateNode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(mocks.updateNode).not.toHaveBeenCalled();

    // Der Dialog schließt über die Browser-History (asynchron).
    fireEvent.click(await screen.findByRole("button", { name: "Aufgabe 1 löschen" }));
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(mocks.updateNode).toHaveBeenCalledTimes(1);
    expect(mocks.updateNode).toHaveBeenCalledWith(
      "knoten-1",
      expect.objectContaining({ content: expect.not.stringContaining("Erste Aufgabe") }),
    );
  });
});
