// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("hält Text und Aktion bei fehlendem Artwork erreichbar", () => {
    const onClick = vi.fn();
    const { container } = render(
      <EmptyState artwork="/missing.webp" title="Projekt fehlt" action={<button onClick={onClick}>Projekte öffnen</button>} />,
    );
    const image = container.querySelector("img")!;
    fireEvent.error(image);
    expect(image.classList.contains("is-loaded")).toBe(false);
    expect(image.alt).toBe("");
    expect(image.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("heading", { name: "Projekt fehlt" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Projekte öffnen" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("zeigt ein gewechseltes Motiv erst nach dessen erfolgreichem Laden", () => {
    const { container, rerender } = render(<EmptyState artwork="/first.webp" title="Leer" />);
    fireEvent.load(container.querySelector("img")!);
    expect(container.querySelector("img")!.classList.contains("is-loaded")).toBe(true);
    rerender(<EmptyState artwork="/second.webp" title="Leer" />);
    expect(container.querySelector("img")!.classList.contains("is-loaded")).toBe(false);
    fireEvent.load(container.querySelector("img")!);
    expect(container.querySelector("img")!.classList.contains("is-loaded")).toBe(true);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")!.classList.contains("is-loaded")).toBe(false);
  });

  it("behält das Icon für Zustände ohne Motiv", () => {
    const { container } = render(<EmptyState title="Keine Treffer" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".empty-state-icon")).toBeTruthy();
  });
});
