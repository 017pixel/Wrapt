// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerMetrics, ServerSummary } from "@wrapt/contracts";
import type { DashboardQuery } from "./DashboardPanels";
import { ServerDiagnosticsPanel } from "./DashboardSystemPanels";

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

const summary: ServerSummary = {
  serverName: "wrapt-test",
  status: "online",
  operatingSystem: {
    platform: "linux",
    distro: "Debian",
    release: "12",
    kernel: "6.1.0",
  },
  uptimeSeconds: 90_000,
  tailscale: {
    state: "connected",
    hostname: "wrapt-test",
    dnsName: "wrapt-test.example",
  },
  lastUpdated: "2026-01-01T10:00:00.000Z",
};

const metrics: ServerMetrics = {
  cpuPercent: 21.5,
  memory: {
    usedBytes: 2 * 1024 ** 3,
    totalBytes: 8 * 1024 ** 3,
    availableBytes: 6 * 1024 ** 3,
  },
  disks: [],
  loadAverage: [1.2, 0.8, 0.5],
  temperatureCelsius: 45.5,
  cpu: {
    brand: "Test CPU 9000",
    cores: 8,
    physicalCores: 4,
    coreLoadPercent: [10, 20],
    coreTemperatures: [40, null, 42.5],
  },
  diskIo: {
    readBytesPerSecond: 2 * 1024 ** 2,
    writeBytesPerSecond: 1024 ** 2,
  },
  topProcesses: [
    { pid: 123, name: "node", cpuPercent: 12.3, memoryBytes: 1024 ** 3 },
    { pid: 456, name: "postgres", cpuPercent: 4.2, memoryBytes: 512 * 1024 ** 2 },
  ],
  history: [],
  historyExtended: [],
  lastUpdated: "2026-01-01T10:00:00.000Z",
};

afterEach(() => {
  cleanup();
});

describe("ServerDiagnosticsPanel", () => {
  it("zeigt CPU-Modell, Kerne, Festplatten-I/O und Kerntemperaturen", () => {
    render(<ServerDiagnosticsPanel
      summary={query(summary)}
      metrics={query(metrics)}
      summaryStale={false}
      metricsStale={false}
    />);

    expect(screen.getByText("Test CPU 9000")).toBeTruthy();
    expect(screen.getByText("8 (4 physisch)")).toBeTruthy();
    expect(screen.getByText("Kerntemperaturen")).toBeTruthy();
    expect(screen.getByText(/Lesen 2,0 MB\/s · Schreiben 1,0 MB\/s/)).toBeTruthy();
    expect(screen.getByText("Kern 1")).toBeTruthy();
    expect(screen.queryByText("Kern 2")).toBeNull();
    expect(screen.getByText("Kern 3")).toBeTruthy();
    expect(screen.getByText("40,0 °C")).toBeTruthy();
    expect(screen.getByText("42,5 °C")).toBeTruthy();

    expect(screen.queryByText("1,2 / 0,8 / 0,5")).toBeNull();
  });

  it("listet die Top-Prozesse mit Name, PID, CPU und RAM", () => {
    render(<ServerDiagnosticsPanel
      summary={query(summary)}
      metrics={query(metrics)}
      summaryStale={false}
      metricsStale={false}
    />);

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Prozess" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "node" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "123" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "12,3 %" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "1.0 GB" })).toBeTruthy();
  });
});
