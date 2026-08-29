// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardMobileDetails, DashboardMobileSummary } from "./DashboardMobileSummary";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setViewport(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

describe("Dashboard-Mobile-Summary", () => {
  it("zeigt Status, Bereitschaft und Live-Marker kompakt an", () => {
    render(<DashboardMobileSummary state={{ tone: "warn", label: "Prüfung nötig", detail: "Ein Dienst antwortet nicht." }} liveLabel="Live · gerade eben" readinessLabel="Bereitschaft unklar" />);

    expect(screen.getByRole("region", { name: "Kompakter Systemstatus" }).textContent).toContain("Prüfung nötig");
    expect(screen.getByText("Bereitschaft unklar")).toBeTruthy();
    expect(screen.getByText("Live · gerade eben")).toBeTruthy();
  });

  it("öffnet Warnungsdetails mobil automatisch und gesunde Details standardmäßig geschlossen", () => {
    setViewport(true);
    const { rerender } = render(<DashboardMobileDetails hasProblem><div>Fehlerdetails</div></DashboardMobileDetails>);
    expect(screen.getByText("Fehlerdetails").parentElement?.hasAttribute("open")).toBe(true);

    rerender(<DashboardMobileDetails hasProblem={false}><div>Gesunde Details</div></DashboardMobileDetails>);
    expect(screen.getByText("Gesunde Details").parentElement?.hasAttribute("open")).toBe(false);
  });
});
