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

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Dashboard" }).textContent).toContain("Prüfung nötig");
    expect(screen.getByText("MacBook")).toBeTruthy();
    expect(screen.getByText("Aktualisiert gerade eben")).toBeTruthy();
    expect(screen.queryByText("Alles betriebsbereit")).toBeNull();
  });

  it("zeigt das Statuslabel auch im Normalzustand als Text", () => {
    const { container } = render(<DashboardMobileSummary state={{ tone: "ok", label: "Betriebsbereit", detail: "" }} serverName="MacBook" liveLabel="Aktualisiert gerade eben" />);

    expect(screen.getByRole("region", { name: "Dashboard" }).textContent).toContain("Betriebsbereit");
    expect(container.querySelector(".dash-mobile-summary-dot")).toBeNull();
  });

  it("führt den Servernamen nicht als Überschrift", () => {
    render(<DashboardMobileSummary state={{ tone: "ok", label: "Betriebsbereit", detail: "" }} serverName="MacBook" liveLabel="Aktualisiert gerade eben" />);

    expect(screen.queryByRole("heading", { name: "MacBook" })).toBeNull();
    expect(screen.getByText("MacBook").tagName).toBe("P");
  });
});
