// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesEmpty } from "./NotesEmpty";

afterEach(cleanup);

describe("NotesEmpty", () => {
  it("behält Aktionen und Text bei einem fehlgeschlagenen Motiv", () => {
    const create = vi.fn();
    const openSidebar = vi.fn();
    const { container } = render(<NotesEmpty windowMode={false} onCreate={create} onOpenSidebar={openSidebar} />);
    const image = container.querySelector("img")!;
    fireEvent.error(image);
    expect(image.classList.contains("is-loaded")).toBe(false);
    expect(image.parentElement?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Neue Seite" }));
    fireEvent.click(screen.getByRole("button", { name: "Seiten öffnen" }));
    expect(create).toHaveBeenCalledOnce();
    expect(openSidebar).toHaveBeenCalledOnce();
  });

  it("zeigt beim ungültigen Fensterlink den bestehenden Fehlerzustand", () => {
    const { container } = render(<NotesEmpty windowMode onCreate={vi.fn()} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Seite nicht gefunden")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Neue Seite" })).toBeNull();
  });
});
