// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexResetHistoryResponse, UsageTimelineResponse } from "@wrapt/contracts";
import { UsageOverview } from "./UsageOverview";
import { useUsagePreferences, defaultUsagePreferences } from "../../stores/usagePreferences";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useUsagePreferences.setState(defaultUsagePreferences());
});

beforeEach(() => {
  useUsagePreferences.setState(defaultUsagePreferences());
});

const now = new Date(2026, 6, 29, 12, 0, 0).getTime();

function timelineData(over: Partial<UsageTimelineResponse> = {}): UsageTimelineResponse {
  return {
    lanes: [
      {
        providerId: "codex",
        accountId: "codex-1",
        accountLabel: "Privat",
        email: "privat@example.com",
        plan: "plus",
        active: true,
        windows: [
          { id: "primary", label: "5-Stunden-Limit", usedPercent: 18, remainingPercent: 82, windowMinutes: 300, resetsAt: "2026-07-29T17:00:00Z" },
          { id: "secondary", label: "Wochenlimit", usedPercent: 74, remainingPercent: 26, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" },
        ],
        resetCredits: [{ id: "credit-1", title: "Full reset", description: "A free reset of your Codex limits", status: "available", grantedAt: "2026-07-13T18:29:31Z", expiresAt: "2026-08-20T18:29:31Z" }],
        status: "available",
        error: null,
        updatedAt: "2026-07-29T10:00:00Z",
      },
      {
        providerId: "codex",
        accountId: "codex-2",
        accountLabel: "Arbeit",
        email: "arbeit@example.com",
        plan: "team",
        active: false,
        windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 96, remainingPercent: 4, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" }],
        resetCredits: [],
        status: "available",
        error: null,
        updatedAt: "2026-07-29T10:00:00Z",
      },
      {
        providerId: "claude",
        accountId: "claude-1",
        accountLabel: "Alice",
        email: "alice@example.com",
        plan: "pro",
        active: false,
        windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 28, remainingPercent: 72, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" }],
        resetCredits: [],
        status: "available",
        error: null,
        updatedAt: "2026-07-29T10:00:00Z",
      },
      {
        providerId: "opencode",
        accountId: "opencode-1",
        accountLabel: "OpenCode Go",
        email: null,
        plan: null,
        active: false,
        windows: [],
        resetCredits: [],
        status: "unavailable",
        error: { code: "NO_USAGE_DATA", message: "Für diesen Account liegen keine Limitfenster vor." },
        updatedAt: null,
      },
    ],
    fetchedAt: "2026-07-29T10:00:00Z",
    lastSuccessfulFetchAt: "2026-07-29T10:00:00Z",
    ...over,
  };
}

describe("UsageOverview", () => {
  it("zeigt die Statuszeile mit Accounts, niedrigen und Aktualisierung", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const summary = screen.getByLabelText("Zusammenfassung der Limits");
    expect(within(summary).getByText("4")).toBeTruthy();
    // Bei 20 % Schwelle ist nur Arbeit (4 %) niedrig; OpenCode hat keine Daten.
    expect(within(summary).getByText("1")).toBeTruthy();
    expect(within(summary).getByText(/aktualisiert/)).toBeTruthy();
    expect(within(summary).queryByText(/nächster Reset/)).toBeNull();
  });

  it("zeigt die kompakte Account-Liste mit allen Limits (Limits jetzt)", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const table = screen.getByRole("table", { name: "Aktuelle Limits je Account" });
    expect(within(table).getByText("Privat")).toBeTruthy();
    expect(within(table).getByText("Arbeit")).toBeTruthy();
    expect(within(table).getByText("Alice")).toBeTruthy();
    expect(within(table).getByText("82 %")).toBeTruthy();
    expect(within(table).getByText("26 %")).toBeTruthy();
  });

  it("zeigt persönliche Banked Resets mit Status und Ablaufdatum", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const panel = screen.getByRole("region", { name: "Banked Resets" });
    expect(within(panel).getByText("Vollständiger Limit-Reset")).toBeTruthy();
    expect(within(panel).getByText("1 verfügbar")).toBeTruthy();
    expect(within(panel).getByText(/Gültig bis/)).toBeTruthy();
    expect(within(panel).getByText(/Kostenloser Reset deiner Codex-Limits/)).toBeTruthy();
  });

  it("zeigt eine stale Tibo-Historie mit Quelle und Community-Hinweis", () => {
    const history: CodexResetHistoryResponse = {
      enabled: true,
      status: "stale",
      resets: [{ id: "reset-1", resetType: "banked", announcedAt: "2026-08-21T11:43:19Z", text: "Banked reset announced", sourceUrl: "https://x.com/thsottiaux/status/123" }],
      stats: { total: 1, lastResetAt: "2026-08-21T11:43:19Z", daysSinceLast: 0.5, averageIntervalDays: 7.7 },
      fetchedAt: "2026-08-21T12:00:00Z",
      lastSuccessfulFetchAt: "2026-08-21T12:00:00Z",
      error: "Verbindung unterbrochen",
    };
    render(<UsageOverview timeline={timelineData()} codexResetHistory={{ data: history, isPending: false, isError: false }} now={now} />);
    const panel = screen.getByRole("region", { name: "Tibo-Reset-Historie" });
    expect(within(panel).getByText("Letzter Stand")).toBeTruthy();
    expect(within(panel).getByText("Banked")).toBeTruthy();
    expect(within(panel).getByText("Verbindung unterbrochen")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /Quelle auf X/ }).getAttribute("href")).toBe(history.resets[0]!.sourceUrl);
    expect(within(panel).getByText(/keine Bestätigung für deinen persönlichen Account/)).toBeTruthy();
  });

  it("markiert den aktiven Account in der Liste", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    expect(screen.getAllByText("Aktiv").length).toBeGreaterThan(0);
  });

  it("zeigt die Statuszeile statt der KPI-Karten standardmäßig (Standardansicht)", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    expect(screen.queryByText("Tokens heute")).toBeNull();
  });

  it("öffnet Filter als zugänglichen Dialog und schließt ihn mit Escape", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: /^Filter$/ }));
    expect(screen.getByRole("dialog", { name: "Filter und Sortierung" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Filter und Sortierung" })).toBeNull();
  });

  it("filtert nach Provider über die Filterleiste", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const select = screen.getByLabelText(/Provider/);
    fireEvent.change(select, { target: { value: "claude" } });
    const table = screen.getByRole("table", { name: "Aktuelle Limits je Account" });
    expect(within(table).getByText("Alice")).toBeTruthy();
    expect(within(table).queryByText("Privat")).toBeNull();
    expect(within(table).queryByText("Arbeit")).toBeNull();
  });

  it("filtert nach aktivem Account", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    fireEvent.click(screen.getByLabelText(/Nur aktiv/));
    const table = screen.getByRole("table", { name: "Aktuelle Limits je Account" });
    expect(within(table).getByText("Privat")).toBeTruthy();
    expect(within(table).queryByText("Arbeit")).toBeNull();
    expect(within(table).queryByText("Alice")).toBeNull();
  });

  it("zeigt bei leeren Filtern eine verständliche Meldung mit Filter-Reset", () => {
    const store = useUsagePreferences.getState();
    store.set({ hiddenAccountIds: ["codex-1", "codex-2", "claude-1", "opencode-1"] });
    render(<UsageOverview timeline={timelineData()} now={now} />);
    expect(screen.getByText(/Keine Accounts entsprechen den gewählten Filtern/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(screen.getByRole("table", { name: "Aktuelle Limits je Account" })).toBeTruthy();
  });

  it("blendet Accounts ohne Daten aus, wenn aktiviert", () => {
    useUsagePreferences.getState().set({ hideAccountsWithoutData: true });
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const table = screen.getByRole("table", { name: "Aktuelle Limits je Account" });
    expect(within(table).queryByText("OpenCode Go")).toBeNull();
    expect(within(table).getByText("Alice")).toBeTruthy();
  });

  it("zeigt bei Warnschwelle 30 mehr niedrige Accounts als bei 20", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const summaryDefault = screen.getByLabelText("Zusammenfassung der Limits");
    // Bei 20 %: nur Arbeit (4 %).
    expect(within(summaryDefault).getByText("1")).toBeTruthy();
    cleanup();
    useUsagePreferences.getState().set({ warningThreshold: 30 });
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const summary30 = screen.getByLabelText("Zusammenfassung der Limits");
    // Bei 30 %: Arbeit (4 %) und Privat (26 %) sind niedrig.
    expect(within(summary30).getByText("2")).toBeTruthy();
  });

  it("blendet deaktivierte Anbieter und Accounts komplett aus", () => {
    const disabled = timelineData({
      lanes: [
        ...timelineData().lanes,
        {
          providerId: "claude",
          accountId: "claude-disabled",
          accountLabel: "Claude Arbeit",
          email: "claude@example.com",
          plan: "pro",
          active: false,
          windows: [{ id: "primary", label: "5-Stunden-Limit", usedPercent: 30, remainingPercent: 70, windowMinutes: 300, resetsAt: "2026-07-29T17:00:00Z" }],
          resetCredits: [],
          status: "disabled",
          error: { code: "MONITORING_DISABLED", message: "Die Limitüberwachung für diesen Anbieter ist in den Einstellungen deaktiviert." },
          updatedAt: null,
        },
      ],
    });
    render(<UsageOverview timeline={disabled} now={now} />);
    // Weder in der Statuszeile noch in der Tabelle oder Timeline taucht der Eintrag auf.
    const summary = screen.getByLabelText("Zusammenfassung der Limits");
    expect(within(summary).getByText("4")).toBeTruthy();
    expect(within(summary).queryByText("5")).toBeNull();
    const table = screen.getByRole("table", { name: "Aktuelle Limits je Account" });
    expect(within(table).queryByText("Claude Arbeit")).toBeNull();
    expect(screen.queryByText("Claude Arbeit")).toBeNull();
  });

  it("zeigt bei komplett deaktivierten Accounts eine Meldung ohne Filter-Reset", () => {
    const allDisabled = timelineData({
      lanes: timelineData().lanes.map((lane) => ({ ...lane, status: "disabled" as const, error: { code: "ACCOUNT_DISABLED", message: "Der Account ist in den Einstellungen deaktiviert." }, windows: [] })),
    });
    render(<UsageOverview timeline={allDisabled} now={now} />);
    expect(screen.getByText("Keine überwachten Accounts vorhanden.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Filter zurücksetzen" })).toBeNull();
  });

  it("öffnet die Accountdetails als strukturierten Dialog", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Arbeit Details" }));
    const dialog = screen.getByRole("dialog", { name: "Arbeit · Limits" });
    expect(within(dialog).queryByText("arbeit@example.com")).toBeNull();
    expect(within(dialog).getByText("4 % verbleibend")).toBeTruthy();
    expect(within(dialog).getByText("96 % verbraucht")).toBeTruthy();
    expect(within(dialog).getByText("Letzter Limitabruf")).toBeTruthy();
  });

  it("zeigt die E-Mail im Dialog, wenn aktiviert", () => {
    useUsagePreferences.getState().set({ showEmail: true });
    render(<UsageOverview timeline={timelineData()} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Arbeit Details" }));
    expect(within(screen.getByRole("dialog", { name: "Arbeit · Limits" })).getByText("arbeit@example.com")).toBeTruthy();
  });

  it("öffnet denselben Detaildialog auf kleinen Displays", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Arbeit Details" }));
    const dialog = screen.getByRole("dialog", { name: "Arbeit · Limits" });
    expect(within(dialog).getByText("4 % verbleibend")).toBeTruthy();
  });
});
