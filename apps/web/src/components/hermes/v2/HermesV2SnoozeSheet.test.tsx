// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HermesV2SnoozeSheet } from "./HermesV2SnoozeSheet";
import { makeSidebar } from "./sidebar-test-fixtures";
import type { SnoozeInput, SnoozeResolution } from "./sidebar-types";

function renderSheet(previewSnooze: (input: SnoozeInput) => SnoozeResolution) {
  const sidebar = makeSidebar({ previewSnooze });
  render(
    <HermesV2SnoozeSheet
      sidebar={sidebar}
      sessionId="a1"
      expectedRevision={7}
      open
      onClose={() => undefined}
    />,
  );
  return sidebar;
}

describe("HermesV2SnoozeSheet", () => {
  afterEach(cleanup);

  it("Presets committen mit Zeitzone und erwarteter Revision", () => {
    const sidebar = renderSheet((input) => ({
      ok: true,
      until: 1_700_000_000_000,
      timeZone: input.timeZone,
    }));
    fireEvent.click(screen.getByRole("radio", { name: "1 Stunde" }));
    fireEvent.click(screen.getByRole("button", { name: "Zurückstellen" }));
    expect(sidebar.calls.snooze[0]).toEqual([
      "a1",
      7,
      { timeZone: expect.any(String), preset: "1h" },
    ]);
  });

  it("zeigt exaktes Datum, Uhrzeit und Zeitzone der Auflösung", () => {
    renderSheet(() => ({
      ok: true,
      until: Date.UTC(2026, 9, 17, 9, 0),
      timeZone: "Europe/Berlin",
    }));
    expect(screen.getByRole("status").textContent).toContain("17.10.");
    expect(screen.getByRole("status").textContent).toContain("(");
  });

  it("eigene Zeit ohne Eingabe sperrt den Commit", () => {
    const sidebar = renderSheet(() => ({ ok: true, until: 1, timeZone: "x" }));
    fireEvent.click(screen.getByRole("radio", { name: "Eigene Zeit" }));
    const commit = screen.getByRole("button", { name: "Zurückstellen" });
    expect(commit.hasAttribute("disabled")).toBe(true);
    expect(sidebar.calls.snooze).toHaveLength(0);
  });

  it("Nicht existierende Zeit zeigt die verständliche Meldung und keinen Commit", () => {
    renderSheet(() => ({
      ok: false,
      code: "NONEXISTENT_TIME",
      message: "Diese Ortszeit existiert an der Zeitumstellung nicht.",
      alternatives: [],
    }));
    fireEvent.click(screen.getByRole("radio", { name: "Eigene Zeit" }));
    fireEvent.change(screen.getByLabelText("Datum"), {
      target: { value: "2026-03-29" },
    });
    fireEvent.change(screen.getByLabelText("Uhrzeit"), {
      target: { value: "02:30" },
    });
    expect(
      screen.getByText("Diese Ortszeit existiert an der Zeitumstellung nicht."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Zurückstellen" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("mehrdeutige DST-Zeit bietet beide Varianten mit UTC-Versatz und committet offsetMinutes", () => {
    const sidebar = renderSheet((input) => {
      if (input.preset === "custom" && input.offsetMinutes === undefined) {
        return {
          ok: false,
          code: "AMBIGUOUS_TIME",
          message: "Diese Ortszeit gibt es zweimal (Zeitumstellung).",
          alternatives: [
            { until: Date.UTC(2026, 9, 25, 0, 30), offsetMinutes: 120 },
            { until: Date.UTC(2026, 9, 25, 1, 30), offsetMinutes: 60 },
          ],
        };
      }
      return { ok: true, until: 1_700_000_000_000, timeZone: input.timeZone };
    });
    fireEvent.click(screen.getByRole("radio", { name: "Eigene Zeit" }));
    fireEvent.change(screen.getByLabelText("Datum"), {
      target: { value: "2026-10-25" },
    });
    fireEvent.change(screen.getByLabelText("Uhrzeit"), {
      target: { value: "02:30" },
    });
    expect(screen.getByRole("alert").textContent).toContain("UTC+02:00");
    expect(screen.getByRole("alert").textContent).toContain("UTC+01:00");
    fireEvent.click(
      screen.getByRole("button", { name: /UTC\+01:00\) wählen/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Zurückstellen" }));
    const call = sidebar.calls.snooze[0];
    const input = call?.[2];
    expect(input?.preset).toBe("custom");
    if (input?.preset === "custom") expect(input.offsetMinutes).toBe(60);
  });

  it("manuelle Änderung nach Alternativwahl hebt den Offset wieder auf", () => {
    const sidebar = renderSheet((input) => {
      if (input.preset === "custom" && input.offsetMinutes === undefined) {
        return {
          ok: false,
          code: "AMBIGUOUS_TIME",
          message: "Mehrfach.",
          alternatives: [
            { until: Date.UTC(2026, 9, 25, 0, 30), offsetMinutes: 120 },
          ],
        };
      }
      return { ok: true, until: 1_700_000_000_000, timeZone: input.timeZone };
    });
    fireEvent.click(screen.getByRole("radio", { name: "Eigene Zeit" }));
    fireEvent.change(screen.getByLabelText("Datum"), {
      target: { value: "2026-10-25" },
    });
    fireEvent.change(screen.getByLabelText("Uhrzeit"), {
      target: { value: "02:30" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /UTC\+02:00\) wählen/ }),
    );
    fireEvent.change(screen.getByLabelText("Uhrzeit"), {
      target: { value: "03:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Zurückstellen" }));
    const input = sidebar.calls.snooze[0]?.[2];
    if (input?.preset === "custom") expect(input.offsetMinutes).toBeUndefined();
  });
});
