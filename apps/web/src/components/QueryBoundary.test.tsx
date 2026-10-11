// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryBoundary } from "./QueryBoundary";
import { ApiClientError } from "../lib/apiClient/transport.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

describe("QueryBoundary", () => {
  it("zeigt bei „Keine Daten\" einen Retry-Knopf statt einer Sackgasse", () => {
    const refetch = vi.fn();
    render(
      <QueryBoundary isLoading={false} isError={false} data={undefined} refetch={refetch}>
        {(data: string) => <p>{data}</p>}
      </QueryBoundary>,
    );

    expect(screen.getByText("Keine Daten verfügbar.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Erneut versuchen/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("zeigt Titel, Aktion und Anfrage-ID aus dem Fehler-Mapping", () => {
    const refetch = vi.fn();
    const fehler = new ApiClientError(503, "REQUEST_FAILED", "Die Wrapt-API ist momentan nicht erreichbar.", "req-abc-123", true);
    render(
      <QueryBoundary isLoading={false} isError error={fehler} data={undefined} refetch={refetch}>
        {(data: string) => <p>{data}</p>}
      </QueryBoundary>,
    );

    expect(screen.getByText("Verbindung fehlgeschlagen")).toBeTruthy();
    expect(screen.getByText(/Anfrage-ID: req-abc-123/)).toBeTruthy();
    expect(screen.getByText(/bei Meldung angeben/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Erneut versuchen/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("zeigt Quarantäne mit Diagnose-Hinweis und Docs-Zeile", () => {
    render(
      <QueryBoundary isLoading={false} isError error={new Error("Der Slot bleibt in Quarantäne gesperrt.")} data={undefined}>
        {(data: string) => <p>{data}</p>}
      </QueryBoundary>,
    );

    expect(screen.getByText("Preview-Slot gesperrt (Quarantäne)")).toBeTruthy();
    expect(screen.getByText(/preview\.config\.json/)).toBeTruthy();
  });
});
