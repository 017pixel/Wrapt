// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PreviewTargetMenu } from "./PreviewTargetMenu";

afterEach(cleanup);

const options = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
];

function renderMenu(overrides: Partial<Parameters<typeof PreviewTargetMenu>[0]> = {}) {
  const onChange = vi.fn();
  render(<PreviewTargetMenu label="Ziel auswählen" value="alpha" options={options} onChange={onChange} {...overrides} />);
  return { onChange };
}

it("zeigt das gewählte Ziel und öffnet das Menü per Klick", () => {
  renderMenu();
  const trigger = screen.getByRole("button", { name: "Ziel auswählen" });
  expect(trigger.textContent).toContain("Alpha");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");

  fireEvent.click(trigger);

  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  const items = screen.getAllByRole("menuitemradio");
  expect(items.map((item) => item.textContent)).toEqual(["Alpha", "Beta"]);
  expect(items[0]!.getAttribute("aria-checked")).toBe("true");
});

it("öffnet per Pfeiltaste und bewegt den Fokus durch die Optionen", async () => {
  renderMenu();
  fireEvent.keyDown(screen.getByRole("button", { name: "Ziel auswählen" }), { key: "ArrowDown" });

  const items = screen.getAllByRole("menuitemradio");
  await waitFor(() => expect(document.activeElement).toBe(items[0]));

  fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
  expect(document.activeElement).toBe(items[1]);

  fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
  expect(document.activeElement).toBe(items[0]);
});

it("übernimmt die Auswahl, schließt und gibt den Fokus an den Trigger zurück", () => {
  const { onChange } = renderMenu();
  const trigger = screen.getByRole("button", { name: "Ziel auswählen" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getAllByRole("menuitemradio")[1]!);

  expect(onChange).toHaveBeenCalledExactlyOnceWith("beta");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("schließt per Escape und gibt den Fokus an den Trigger zurück", () => {
  renderMenu();
  const trigger = screen.getByRole("button", { name: "Ziel auswählen" });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("schließt bei einem Klick außerhalb", () => {
  renderMenu();
  fireEvent.click(screen.getByRole("button", { name: "Ziel auswählen" }));
  fireEvent.pointerDown(document.body);

  expect(screen.queryByRole("menu")).toBeNull();
});

it("bleibt ohne Optionen deaktiviert", () => {
  renderMenu({ options: [] });
  const trigger = screen.getByRole("button", { name: "Ziel auswählen" });
  expect((trigger as HTMLButtonElement).disabled).toBe(true);
  expect(trigger.textContent).toContain("Kein Browser-Ziel erkannt");
});

it("zeigt bei fehlender Auswahl den Platzhalter statt einer Fehlmeldung", () => {
  renderMenu({ value: "", placeholder: "Ziel wählen" });
  const trigger = screen.getByRole("button", { name: "Ziel auswählen" });
  expect(trigger.textContent).toContain("Ziel wählen");
  expect((trigger as HTMLButtonElement).disabled).toBe(false);
});
