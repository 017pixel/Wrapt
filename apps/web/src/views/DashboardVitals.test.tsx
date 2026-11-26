// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerMetrics } from "@wrapt/contracts";
import type { DashboardQuery } from "./DashboardPanels";
import { VitalsBand } from "./DashboardVitals";

function query<T>(data: T | undefined, overrides: Partial<DashboardQuery<T>> = {}): DashboardQuery<T> {
  return {
    data,
    isPending: data === undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(async () => ({}) as never),
    ...overrides,
  } as unknown as DashboardQuery<T>;
}

function serverMetrics(overrides: Partial<ServerMetrics> = {}): ServerMetrics {
  return {
    cpuPercent: 21.5,
    memory: {
      usedBytes: 2 * 1024 ** 3,
      totalBytes: 8 * 1024 ** 3,
      availableBytes: 6 * 1024 ** 3,
    },
    disks: [{
      mount: "/",
      usedBytes: 400 * 1024 ** 3,
      totalBytes: 500 * 1024 ** 3,
      availableBytes: 100 * 1024 ** 3,
      usedPercent: 80,
    }],
    loadAverage: [1.2, 0.8, 0.5],
    temperatureCelsius: 45.5,
    network: {
      receivedBytesPerSecond: 1024 ** 2,
      transmittedBytesPerSecond: 512 * 1024,
      interfaces: [],
    },
    diskIo: { readBytesPerSecond: 2 * 1024 ** 2, writeBytesPerSecond: 1024 ** 2 },
    topProcesses: [],
    history: [],
    historyExtended: [],
    lastUpdated: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("VitalsBand", () => {
  it("zeigt sechs Kennzahlen mit Netzwerk statt Serverlaufzeit", () => {
    render(<VitalsBand metrics={query(serverMetrics())} showMetrics metricsStale={false} />);

    expect(screen.getAllByRole("article").length).toBe(6);
    expect(screen.queryByText("Serverlaufzeit")).toBeNull();

    const network = screen.getByRole("article", { name: "Netzwerk" });
    expect(network.textContent).toContain("Empfangen");
    expect(network.textContent).toContain("Senden");
    expect(network.textContent).toContain("1,0MB/s");
    expect(network.textContent).toContain("512,0KB/s");
    expect(network.textContent).toContain("Aktuelle Übertragung");

    expect(screen.getByText("1,2 / 0,8 / 0,5")).toBeTruthy();
    expect(screen.getByText("45,5")).toBeTruthy();
  });

  it("kündigt Ladezustand für Screenreader an", () => {
    render(<VitalsBand metrics={query<ServerMetrics>(undefined)} showMetrics metricsStale={false} />);

    expect(screen.getByText("CPU wird geladen")).toBeTruthy();
    expect(screen.getByText("Netzwerk wird geladen")).toBeTruthy();
  });

  it("meldet fehlende Netzwerkwerte neutral statt als Null", () => {
    render(<VitalsBand
      metrics={query(serverMetrics({
        network: { receivedBytesPerSecond: null, transmittedBytesPerSecond: null, interfaces: [] },
      }))}
      showMetrics
      metricsStale={false}
    />);

    const network = screen.getByRole("article", { name: "Netzwerk" });
    expect(network.textContent).toContain("Nicht verfügbar");
    expect(network.textContent).not.toContain("0,0MB/s");
  });
});
