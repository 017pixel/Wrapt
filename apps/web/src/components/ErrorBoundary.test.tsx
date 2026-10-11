// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function explodiert(): never {
  throw new Error("Kaputte Ansicht");
}

function Kaputt() {
  explodiert();
  return null;
}

describe("ErrorBoundary", () => {
  let fehlerStumm: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fehlerStumm = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    fehlerStumm.mockRestore();
  });

  it("zeigt nach zweimaligem Werfen stabil die Ersatzansicht statt zu loopen", () => {
    const retryMelder = vi.fn();
    render(
      <ErrorBoundary label="Testbereich" onRetry={retryMelder}>
        <Kaputt />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(retryMelder).toHaveBeenCalledTimes(1);
    // Die Komponente wirft erneut: wieder Ersatzansicht, kein Absturz der Suite.
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(retryMelder).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Testbereich konnte nicht angezeigt werden/)).toBeTruthy();
  });

  it("hängt die Kinder beim Retry neu ein (Erholung nach einmaligem Fehler)", () => {
    let sollWerfen = true;
    function Wackelig() {
      if (sollWerfen) throw new Error("Einmal kaputt");
      return <p>Ansicht läuft wieder</p>;
    }
    render(
      <ErrorBoundary label="Testbereich">
        <Wackelig />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    sollWerfen = false;
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(screen.getByText("Ansicht läuft wieder")).toBeTruthy();
  });

  it("bleibt bei silent ohne Ersatzansicht leer", () => {
    const { container } = render(
      <ErrorBoundary silent>
        <Kaputt />
      </ErrorBoundary>,
    );
    expect(container.querySelector("[role='alert']")).toBeNull();
  });
});
