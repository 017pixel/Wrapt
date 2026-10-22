// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HermesV2Diagnostics } from "@wrapt/contracts/hermes-v2";
import { MemoryRouter } from "react-router";
import { HermesV2DiagnosticsArea } from "./HermesV2DiagnosticsArea";
import { errorRead, makeResourceFixture, readyRead, textResource } from "./resource-fixtures";

afterEach(cleanup);

const diagnostics: HermesV2Diagnostics = {
  scope: "0".repeat(64),
  connection: { state: "online", epoch: "epoch-7", subscriptions: 2, protectedRuntime: true },
  dashboard: { reachable: true, version: "v9.1", gatewayState: "serving", error: null },
  update: {
    phase: "idle",
    pending: false,
    lastResult: "lauf ohne Fehler",
    lastCheckedAt: "2026-10-17T06:00:00Z",
    logTail: textResource({ text: "Zeile 1\nZeile 2", truncated: true }),
  },
  logs: textResource({ text: "gateway ok", truncated: false }),
  truncated: false,
  adminPath: "/hermes",
};

describe("HermesV2DiagnosticsArea", () => {
  it("zeigt echten Verbindungs- und Dashboardstatus statt Attrappe", () => {
    const fixture = makeResourceFixture({
      diagnostics: readyRead(diagnostics),
      copyDiagnostics: vi.fn().mockResolvedValue(undefined),
    } as never);
    render(<MemoryRouter><HermesV2DiagnosticsArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByText("Verbunden")).toBeTruthy();
    expect(screen.getByText("epoch-7")).toBeTruthy();
    expect(screen.getByText("serving")).toBeTruthy();
    expect(screen.getByText("Diagnose aktualisieren")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Hermes-Verwaltung öffnen" })).toBeTruthy();
  });

  it("Kopieren läuft nur auf Klick und bleibt sichtbar", () => {
    const copyDiagnostics = vi.fn().mockResolvedValue(undefined);
    const fixture = makeResourceFixture({
      diagnostics: readyRead(diagnostics),
      copyDiagnostics,
    } as never);
    render(<MemoryRouter><HermesV2DiagnosticsArea resources={fixture} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Diagnose kopieren" }));
    expect(copyDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("Clipboard-Fehler bleiben ehrlich sichtbar", () => {
    const fixture = makeResourceFixture({
      diagnostics: readyRead(diagnostics),
      copy: {
        status: "error",
        error: {
          code: "INVALID_RESOURCE_REQUEST",
          message: "Zwischenablage schloss den Schreibzugriff.",
          outcome: "not_sent",
          status: 400,
          retryable: false,
        },
      },
    } as never);
    render(<MemoryRouter><HermesV2DiagnosticsArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByText(/Zwischenablage fehlgeschlagen/)).toBeTruthy();
  });

  it("Fehlerzustand bleibt geladen und zeigt bewusstes Neulesen an", () => {
    const fixture = makeResourceFixture({
      diagnostics: errorRead({ code: "RESOURCE_UNAVAILABLE", message: "Diagnosequelle nativ unbestätigt.", outcome: "unknown" }),
    } as never);
    render(<MemoryRouter><HermesV2DiagnosticsArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByText("Diagnosequelle nativ unbestätigt.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Diagnose aktualisieren" }).length).toBeGreaterThan(0);
  });
});
