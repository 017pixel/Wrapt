// UItests Projektpicker: Sortierung, Listbox, Tastatur und Klick außerhalb.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HermesV2ProjectPicker,
  sortProjectsByUsage,
  type HermesV2ProjectOption,
} from "./HermesV2ProjectPicker";

function project(
  id: string,
  name: string,
  lastUsedAt: string | null,
): HermesV2ProjectOption {
  return { id, name, lastUsedAt };
}

function renderPicker(
  overrides: Partial<{
    projects: HermesV2ProjectOption[];
    value: string;
    onChange: (id: string) => void;
  }> = {},
) {
  const onChange = overrides.onChange ?? vi.fn();
  const view = render(
    <HermesV2ProjectPicker
      projects={overrides.projects ?? []}
      value={overrides.value ?? ""}
      onChange={onChange}
    />,
  );
  return { onChange, view };
}

describe("HermesV2ProjectPicker", () => {
  afterEach(cleanup);

  it("sortiert zuletzt genutzte Projekte zuerst und die übrigen alphabetisch", () => {
    const sorted = sortProjectsByUsage([
      project("alt", "Zulu", "2026-01-01T00:00:00.000Z"),
      project("neu", "Alpha", "2026-06-01T00:00:00.000Z"),
      project("ohne-b", "Bravo", null),
      project("ohne-a", "Anton", null),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual([
      "neu",
      "alt",
      "ohne-a",
      "ohne-b",
    ]);
  });

  it("behandelt einen kaputten Zeitstempel wie fehlende Nutzung", () => {
    const sorted = sortProjectsByUsage([
      project("kaputt", "Zeta", "kein-datum"),
      project("gut", "Alpha", "2026-06-01T00:00:00.000Z"),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["gut", "kaputt"]);
  });

  it("zeigt den gewählten Projektnamen im Chip und „Ohne Projekt“ als Default", () => {
    const { view } = renderPicker({
      projects: [project("p1", "Projekt Eins", null)],
      value: "p1",
    });
    const trigger = screen.getByRole("button", { name: /Projekt wählen/ });
    expect(trigger.textContent).toContain("Projekt Eins");
    view.rerender(
      <HermesV2ProjectPicker projects={[]} value="" onChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Projekt wählen: Ohne Projekt" }),
    ).toBeTruthy();
  });

  it("öffnet eine Listbox mit „Ohne Projekt“ an erster Stelle", () => {
    renderPicker({ projects: [project("p1", "Projekt Eins", null)] });
    fireEvent.click(screen.getByRole("button", { name: /Projekt wählen/ }));
    const options = screen.getAllByRole("option");
    expect(options[0]?.textContent).toBe("Ohne Projekt");
    expect(options[1]?.textContent).toBe("Projekt Eins");
    expect(
      screen.getByRole("option", { name: "Ohne Projekt" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
  });

  it("übergibt die Auswahl und schließt das Menü", () => {
    const onChange = vi.fn();
    renderPicker({
      projects: [project("p1", "Projekt Eins", null)],
      onChange,
    });
    fireEvent.click(screen.getByRole("button", { name: /Projekt wählen/ }));
    fireEvent.click(screen.getByRole("option", { name: "Projekt Eins" }));
    expect(onChange).toHaveBeenCalledWith("p1");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("bedient die Liste mit Pfeiltasten, Home und End", async () => {
    renderPicker({
      projects: [
        project("p1", "Projekt Eins", null),
        project("p2", "Projekt Zwei", null),
      ],
    });
    const trigger = screen.getByRole("button", { name: /Projekt wählen/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("option", { name: "Ohne Projekt" }),
      ),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Projekt Eins" }),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Projekt Zwei" }),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Ohne Projekt" }),
    );
  });

  it("schließt das Menü bei Klick außerhalb und bei Escape", () => {
    renderPicker({ projects: [project("p1", "Projekt Eins", null)] });
    const trigger = screen.getByRole("button", { name: /Projekt wählen/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("zeigt das Suchfeld erst bei einer längeren Liste", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      project(`p${index}`, `Projekt ${index}`, null),
    );
    const { view } = renderPicker({ projects: many });
    fireEvent.click(screen.getByRole("button", { name: /Projekt wählen/ }));
    expect(screen.getByRole("searchbox", { name: "Projekt suchen" })).toBeTruthy();
    view.rerender(
      <HermesV2ProjectPicker
        projects={[project("p1", "Projekt Eins", null)]}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});
