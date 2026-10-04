// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UsageTimelineLane, UsageTimelineResponse } from "@wrapt/contracts";
import { defaultUsagePreferences, useUsagePreferences } from "../../stores/usagePreferences";
import { UsageOverview } from "./UsageOverview";

const now = Date.parse("2026-10-02T12:00:00Z");

function account(accountId: string, accountLabel: string, remaining: number, overrides: Partial<UsageTimelineLane> = {}): UsageTimelineLane {
  return {
    providerId: "codex",
    accountId,
    accountLabel,
    email: null,
    plan: null,
    active: false,
    windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 100 - remaining, remainingPercent: remaining, windowMinutes: 10_080, resetsAt: "2026-10-05T12:00:00Z" }],
    resetCredits: [],
    status: "available",
    error: null,
    updatedAt: "2026-10-02T11:00:00Z",
    ...overrides,
  };
}

function timeline(lanes: UsageTimelineLane[] = [
  account("codex-gesund", "Gesund", 75, { active: true }),
  account("codex-knapp", "Knapp", 15),
  account("claude-team", "Team", 25, { providerId: "claude" }),
  account("opencode-fehler", "Ohne Daten", 0, {
    providerId: "opencode",
    windows: [],
    status: "unavailable",
    updatedAt: null,
    error: { code: "NO_USAGE_DATA", message: "Der Anbieter konnte keine Limits liefern." },
  }),
]): UsageTimelineResponse {
  return { lanes, fetchedAt: "2026-10-02T12:00:00Z", lastSuccessfulFetchAt: "2026-10-02T11:00:00Z" };
}

function limitsTable() {
  return screen.getByRole("table", { name: "Aktuelle Limits je Account" });
}

beforeEach(() => {
  useUsagePreferences.setState(defaultUsagePreferences());
});

afterEach(() => {
  cleanup();
  useUsagePreferences.setState(defaultUsagePreferences());
});

describe("UsageOverview, kombinierte Filter und Datenwechsel", () => {
  it("respektiert manuell ausgeblendete Accounts auch im Problemfilter", () => {
    render(<UsageOverview timeline={timeline()} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Nur problematische" }));
    fireEvent.click(screen.getByRole("button", { name: "Accounts ausblenden" }));
    const picker = screen.getByRole("dialog", { name: "Accounts ausblenden" });
    fireEvent.click(within(picker).getByRole("checkbox", { name: /Knapp/ }));

    expect(within(limitsTable()).queryByRole("button", { name: "Knapp Details" })).toBeNull();
    expect(within(limitsTable()).getByRole("button", { name: "Ohne Daten Details" })).toBeTruthy();
    fireEvent.click(within(picker).getByRole("button", { name: "Alle einblenden" }));
    expect(within(limitsTable()).getByRole("button", { name: "Knapp Details" })).toBeTruthy();
  });

  it("blendet Accounts ohne Daten auch bei aktivem Problemfilter aus", () => {
    render(<UsageOverview timeline={timeline()} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Nur problematische" }));
    fireEvent.click(screen.getByRole("button", { name: "Ohne Daten ausblenden" }));

    expect(within(limitsTable()).getByRole("button", { name: "Knapp Details" })).toBeTruthy();
    expect(within(limitsTable()).queryByRole("button", { name: "Ohne Daten Details" })).toBeNull();
    expect(within(limitsTable()).queryByRole("button", { name: "Gesund Details" })).toBeNull();
  });

  it("sortiert innerhalb der Providergruppen und entfernt leere Gruppen nach dem Filtern", () => {
    useUsagePreferences.getState().set({ groupByProvider: true, sortBy: "name" });
    render(<UsageOverview timeline={timeline()} now={now} />);
    const tables = screen.getAllByRole("table", { name: "Aktuelle Limits je Account" });
    expect(tables).toHaveLength(3);
    expect(within(tables[0]!).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Gesund Details", "Knapp Details"]);

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "claude" } });
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Claude Code1"]);
    expect(screen.getAllByRole("table", { name: "Aktuelle Limits je Account" })).toHaveLength(1);
    expect(within(limitsTable()).getByRole("button", { name: "Team Details" })).toBeTruthy();
  });

  it("setzt nur Filter zurück und behält Gruppierung, Sortierung und Warnschwelle", () => {
    useUsagePreferences.getState().set({
      providerFilter: "claude",
      onlyActive: true,
      onlyProblematic: true,
      hideAccountsWithoutData: true,
      hiddenAccountIds: ["codex-gesund"],
      groupByProvider: true,
      sortBy: "name",
      warningThreshold: 30,
    });
    render(<UsageOverview timeline={timeline()} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));

    expect(screen.getAllByRole("table", { name: "Aktuelle Limits je Account" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /Details$/ })).toHaveLength(4);
    expect((screen.getByLabelText("Provider") as HTMLSelectElement).value).toBe("all");
    for (const select of screen.getAllByLabelText("Sortierung")) expect((select as HTMLSelectElement).value).toBe("name");
    expect(screen.getByRole("button", { name: "Nur aktiv" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Nur problematische" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Ohne Daten ausblenden" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(screen.getByLabelText("Zusammenfassung der Limits")).getByText("2")).toBeTruthy();
  });

  it("schließt die Account-Auswahl mit Escape und gibt den Fokus an ihren Auslöser zurück", () => {
    render(<UsageOverview timeline={timeline()} now={now} />);
    const trigger = screen.getByRole("button", { name: "Accounts ausblenden" });
    fireEvent.click(trigger);
    const picker = screen.getByRole("dialog", { name: "Accounts ausblenden" });
    within(picker).getAllByRole("checkbox")[0]!.focus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Accounts ausblenden" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("zeigt bei fehlenden Limitdaten den Anbieterfehler im Detaildialog", () => {
    render(<UsageOverview timeline={timeline()} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Ohne Daten Details" }));
    const dialog = screen.getByRole("dialog", { name: "Ohne Daten · Limits" });

    expect(within(dialog).getByText("Nicht verfügbar")).toBeTruthy();
    expect(within(dialog).getByText("Nicht bekannt")).toBeTruthy();
    expect(within(dialog).getByText("Für diesen Account liegen keine Limitfenster vor.")).toBeTruthy();
    expect(within(dialog).getByText("Der Anbieter konnte keine Limits liefern.")).toBeTruthy();
    expect(within(dialog).queryByText(/% verbleibend/)).toBeNull();
  });

  it("schließt veraltete Accountdetails, wenn der Account beim nächsten Abruf entfällt", () => {
    const data = timeline();
    const { rerender } = render(<UsageOverview timeline={data} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Knapp Details" }));
    expect(screen.getByRole("dialog", { name: "Knapp · Limits" })).toBeTruthy();

    rerender(<UsageOverview timeline={timeline(data.lanes.filter((lane) => lane.accountId !== "codex-knapp"))} now={now} />);
    expect(screen.queryByRole("dialog", { name: "Knapp · Limits" })).toBeNull();
    expect(within(limitsTable()).queryByRole("button", { name: "Knapp Details" })).toBeNull();
    expect(within(limitsTable()).getByRole("button", { name: "Gesund Details" })).toBeTruthy();
  });

  it("empfiehlt keine hohe Restkapazität aus veralteten oder fehlgeschlagenen Abrufen", () => {
    const reliable = account("aktuell", "Aktuelles Konto", 40);
    const uncertain = [
      account("alt", "Alter Stand", 99, { status: "stale" }),
      account("fehler", "Fehlgeschlagen", 100, { status: "unavailable" }),
    ];
    const { rerender } = render(<UsageOverview timeline={timeline([...uncertain, reliable])} now={now} />);
    const summary = screen.getByLabelText("Zusammenfassung der Limits");
    expect(within(summary).getByText("Aktuelles Konto")).toBeTruthy();
    expect(within(summary).queryByText("Alter Stand")).toBeNull();
    expect(within(summary).queryByText("Fehlgeschlagen")).toBeNull();

    rerender(<UsageOverview timeline={timeline(uncertain)} now={now} />);
    expect(within(screen.getByLabelText("Zusammenfassung der Limits")).queryByText("Beste verfügbare Kapazität")).toBeNull();
  });
});
