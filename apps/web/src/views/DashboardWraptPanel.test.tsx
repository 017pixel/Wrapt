// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HealthResponse,
  HermesStatus,
  Notification,
  NotificationListResponse,
  OperationalMetricsResponse,
  ServicesResponse,
  T3ChannelStatusResponse,
  UpdateStatusResponse,
} from "@wrapt/contracts";
import { DashboardWraptPanel, type DashboardWraptPanelProps } from "./DashboardWraptPanel";
import type { DashboardQuery } from "./DashboardPanels";

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

const update: UpdateStatusResponse = {
  branch: "main",
  version: "3.2.5",
  localHash: "a",
  localShort: "a",
  remoteHash: "b",
  remoteShort: "b",
  updateAvailable: true,
  dirty: false,
  dirtyFiles: [],
  dirtyCount: 0,
  checkedAt: "2026-01-01T00:00:00.000Z",
  message: "Geprüft",
};

const notification: Notification = {
  id: "00000000-0000-4000-8000-000000000010",
  source: "opencode",
  kind: "session",
  severity: "info",
  category: "coding-agent",
  sourceIcon: "opencode",
  state: "active",
  title: "Neue Sitzung",
  body: "",
  link: "/wrapt/opencode?session=1",
  remoteId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  readAt: null,
  acknowledgedAt: null,
  deletedAt: null,
  resolvedAt: null,
  meta: {},
  report: null,
};

function notificationResponse(): NotificationListResponse {
  return {
    notifications: [notification],
    unreadCount: 1,
    unacknowledgedErrorCount: 0,
    nextCursor: null,
  };
}

function renderPanel(props: Partial<DashboardWraptPanelProps> = {}) {
  const defaultProps: DashboardWraptPanelProps = {
    health: query<HealthResponse>(undefined),
    updateStatus: query<UpdateStatusResponse>(update),
    t3Channel: query<T3ChannelStatusResponse>(undefined),
    hermesStatus: query<HermesStatus>(undefined),
    services: query<ServicesResponse>(undefined),
    operationalMetrics: query<OperationalMetricsResponse>(undefined),
    notifications: query<NotificationListResponse>(undefined),
    ...props,
  };
  return render(
    <MemoryRouter>
      <DashboardWraptPanel {...defaultProps} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("DashboardWraptPanel", () => {
  it("meldet fehlgeschlagene Aktualisierungen mit vorhandenen Altdaten", () => {
    renderPanel({ updateStatus: query(update, { isError: true }) });

    expect(screen.getByText(/Letzte Prüfung fehlgeschlagen: Update/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Erneut versuchen/ })).toBeTruthy();
  });

  it("zeigt keinen Fehlerhinweis, wenn alle Quellen aktuell sind", () => {
    renderPanel();

    expect(screen.queryByText(/Letzte Prüfung fehlgeschlagen/)).toBeNull();
  });

  it("entfernt den App-Basename aus Benachrichtigungslinks", () => {
    renderPanel({ notifications: query<NotificationListResponse>(notificationResponse()) });

    const link = screen.getByRole("link", { name: /Ungelesene Ereignisse/ });
    expect(link.getAttribute("href")).toBe("/opencode?session=1");
  });

  it("zeigt während des Ladens keine leere Ereignisliste", () => {
    renderPanel();

    const row = screen.getByText("Ungelesene Ereignisse").closest("li");
    expect(row?.textContent).toContain("Wird geladen …");
    expect(row?.textContent).not.toContain("Keine neuen Ereignisse");
  });

  it("meldet einen Erstfehler ohne Altdaten und bietet einen Retry", () => {
    renderPanel({
      notifications: query<NotificationListResponse>(undefined, { isError: true, isPending: false }),
    });

    expect(screen.getByText(/Letzte Prüfung fehlgeschlagen: Ereignisse/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Erneut versuchen/ })).toBeTruthy();
    const row = screen.getByText("Ungelesene Ereignisse").closest("li");
    expect(row?.textContent).toContain("Nicht verfügbar");
  });

  it("rendert die Dienste-Zeile ohne Link und Chevron", () => {
    renderPanel();

    const row = screen.getByText("Dienste").closest("li");
    expect(row?.querySelector("a")).toBeNull();
    expect(row?.querySelector("svg")).toBeNull();
  });
});
