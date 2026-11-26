// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerMetricHistorySample, ServerMetrics } from "@wrapt/contracts";
import type { DashboardQuery } from "./DashboardPanels";
import { DashboardHistoryPanel } from "./DashboardHistoryPanel";

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

const HISTORY: ServerMetricHistorySample[] = [
  {
    timestamp: "2026-01-01T10:00:00.000Z",
    cpuPercent: 20,
    memoryPercent: 40,
    networkReceivedBytesPerSecond: 1024 ** 2,
    networkTransmittedBytesPerSecond: 512 * 1024,
    diskReadBytesPerSecond: 1024 ** 2,
    diskWriteBytesPerSecond: 512 * 1024,
  },
  {
    timestamp: "2026-01-01T10:30:00.000Z",
    cpuPercent: 40,
    memoryPercent: 50,
    networkReceivedBytesPerSecond: 2 * 1024 ** 2,
    networkTransmittedBytesPerSecond: 1024 ** 2,
    diskReadBytesPerSecond: 2 * 1024 ** 2,
    diskWriteBytesPerSecond: 1024 ** 2,
  },
  {
    timestamp: "2026-01-01T11:00:00.000Z",
    cpuPercent: 60,
    memoryPercent: 60,
    networkReceivedBytesPerSecond: 3 * 1024 ** 2,
    networkTransmittedBytesPerSecond: 1536 * 1024,
    diskReadBytesPerSecond: 3 * 1024 ** 2,
    diskWriteBytesPerSecond: 1536 * 1024,
  },
];

function serverMetrics(overrides: Partial<ServerMetrics> = {}): ServerMetrics {
  return {
    cpuPercent: 20,
    memory: {
      usedBytes: 2 * 1024 ** 3,
      totalBytes: 8 * 1024 ** 3,
      availableBytes: 6 * 1024 ** 3,
    },
    disks: [],
    loadAverage: [1, 0.8, 0.5],
    temperatureCelsius: 45,
    topProcesses: [],
    history: HISTORY,
    historyExtended: [],
    lastUpdated: "2026-01-01T11:00:00.000Z",
    ...overrides,
  };
}

function axisTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

afterEach(() => {
  cleanup();
});

describe("DashboardHistoryPanel", () => {
  it("zeigt den Serververlauf mit echten Zeitfenster-Labels", () => {
    render(<DashboardHistoryPanel metrics={query(serverMetrics())} stale={false} />);

    expect(screen.getByText("Messverlauf")).toBeTruthy();
    expect(screen.getByText("CPU")).toBeTruthy();
    expect(screen.getByText("Arbeitsspeicher")).toBeTruthy();

    const labels = document.querySelectorAll(".chart-axis span");
    expect(labels.length).toBe(3);
    expect(labels[0]?.textContent).toBe(axisTime("2026-01-01T10:00:00.000Z"));
    expect(labels[2]?.textContent).toBe(axisTime("2026-01-01T11:00:00.000Z"));
  });

  it("legt Reihen mit Lücken auf dieselbe Zeitachse", () => {
    render(<DashboardHistoryPanel
      metrics={query(serverMetrics({
        history: HISTORY.map((sample, index) => ({
          ...sample,
          networkReceivedBytesPerSecond: index === 2 ? null : sample.networkReceivedBytesPerSecond,
          networkTransmittedBytesPerSecond: index === 1 ? null : sample.networkTransmittedBytesPerSecond,
        })),
      }))}
      stale={false}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Netzwerk" }));

    const positions = [...document.querySelectorAll(".chart-svg circle")]
      .map((circle) => Number(circle.getAttribute("cx")));
    expect(positions).toEqual([0, 500, 0, 1000]);
  });

  it("nennt einen einzelnen Messpunkt im Singular", () => {
    render(<DashboardHistoryPanel
      metrics={query(serverMetrics({ history: HISTORY.slice(0, 1) }))}
      stale={false}
    />);

    expect(screen.getByText("1 Punkt")).toBeTruthy();
  });

  it("schaltet zwischen CPU/RAM, Netzwerk und Disk-I/O um", () => {
    render(<DashboardHistoryPanel metrics={query(serverMetrics())} stale={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Netzwerk" }));
    expect(screen.getByRole("button", { name: "Netzwerk" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Empfangen")).toBeTruthy();
    expect(screen.getByText("Senden")).toBeTruthy();
    expect(screen.getAllByText(/3,0 MB\/s/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Disk-I/O" }));
    expect(screen.getByText("Lesen")).toBeTruthy();
    expect(screen.getByText("Schreiben")).toBeTruthy();
    expect(screen.getAllByText(/1,5 MB\/s/).length).toBeGreaterThan(0);
  });

  it("erfindet keine Netzwerkwerte, wenn der Verlauf keine Messungen enthält", () => {
    render(<DashboardHistoryPanel
      metrics={query(serverMetrics({
        history: HISTORY.map((sample) => ({
          ...sample,
          networkReceivedBytesPerSecond: null,
          networkTransmittedBytesPerSecond: null,
        })),
      }))}
      stale={false}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Netzwerk" }));
    expect(screen.getByText("Keine Werte für diesen Zeitraum.")).toBeTruthy();
    expect(screen.queryByText(/0,0 MB\/s/)).toBeNull();
  });

  it("kündigt einen leeren Verlauf als Aufbau an", () => {
    render(<DashboardHistoryPanel metrics={query(serverMetrics({ history: [] }))} stale={false} />);

    expect(screen.getByText("Noch keine Messpunkte im Verlauf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Netzwerk" })).toBeNull();
  });

  it("zeigt während des Ladens einen Skeleton", () => {
    render(<DashboardHistoryPanel metrics={query<ServerMetrics>(undefined)} stale={false} />);

    expect(screen.getByText("Messverlauf laden")).toBeTruthy();
    expect(screen.queryByText("Messverlauf wird aufgebaut")).toBeNull();
  });
});
