// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardMobileSummary } from "./DashboardMobileSummary";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Dashboard-Mobile-Summary", () => {
  it("zeigt den Status und Aktualisierungszeitpunkt kompakt an", () => {
    render(<DashboardMobileSummary state={{ tone: "warn", label: "Prüfung nötig", detail: "Ein Dienst antwortet nicht." }} serverName="MacBook" liveLabel="Aktualisiert gerade eben" />);

    expect(screen.getByRole("region", { name: "Dashboard" }).textContent).toContain("Prüfung nötig");
    expect(screen.getByText("MacBook")).toBeTruthy();
    expect(screen.getByText("Aktualisiert gerade eben")).toBeTruthy();
    expect(screen.queryByText("Alles betriebsbereit")).toBeNull();
  });

  it("zeigt Problemdetails nur bei Warnungen", () => {
    const { rerender } = render(<DashboardMobileSummary state={{ tone: "warn", label: "Prüfung nötig", detail: "Ein Dienst antwortet nicht." }} serverName="MacBook" liveLabel="Aktualisiert gerade eben" />);
    expect(screen.getByRole("region", { name: "Dashboard" }).textContent).toContain("Ein Dienst antwortet nicht.");

    rerender(<DashboardMobileSummary state={{ tone: "ok", label: "", detail: "" }} serverName="MacBook" liveLabel="Aktualisiert gerade eben" />);
    expect(screen.queryByText("Server und Wrapt laufen normal.")).toBeNull();
    expect(screen.getByText("MacBook")).toBeTruthy();
  });
});
