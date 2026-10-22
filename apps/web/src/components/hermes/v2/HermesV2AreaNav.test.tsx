// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2AreaNav } from "./HermesV2AreaNav";

describe("HermesV2AreaNav", () => {
  afterEach(cleanup);

  it("beschriftet jedes Ziel zugänglich Bereich: <Name> mit echter Rollof", () => {
    render(<HermesV2AreaNav area="chat" onSelect={vi.fn()} />);
    const list = screen.getByRole("tablist", { name: "Hermes-V2-Bereich" });
    expect(list).toBeTruthy();
    for (const name of ["Chat", "Cron", "Skills", "Memory", "Konfiguration", "Diagnose"]) {
      const tab = screen.getByRole("tab", { name: `Bereich: ${name}` });
      expect(tab.getAttribute("aria-selected")).toBe(name === "Chat" ? "true" : "false");
    }
  });

  it("zeigt nur Icons und hält die Namen als Tooltip und zugänglichen Namen", () => {
    render(<HermesV2AreaNav area="chat" onSelect={vi.fn()} />);
    for (const name of ["Chat", "Cron", "Skills", "Memory", "Konfiguration", "Diagnose"]) {
      const tab = screen.getByRole("tab", { name: `Bereich: ${name}` });
      expect(tab.getAttribute("title")).toBe(name);
      expect(tab.textContent).toBe("");
      expect(tab.querySelector("svg")).toBeTruthy();
    }
  });

  it("wählt per Klick den Zielbereich und setzt aria-selected neu", () => {
    const onSelect = vi.fn();
    render(<HermesV2AreaNav area="chat" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bereich: Cron" }));
    expect(onSelect).toHaveBeenCalledWith("cron");
  });

  it("bewegt den Fokus mit Pfeiltasten und Home/End (Roving Tabindex)", () => {
    render(<HermesV2AreaNav area="chat" onSelect={vi.fn()} />);
    const chat = screen.getByRole("tab", { name: "Bereich: Chat" }) as HTMLButtonElement;
    const cron = screen.getByRole("tab", { name: "Bereich: Cron" }) as HTMLButtonElement;
    const skills = screen.getByRole("tab", { name: "Bereich: Skills" }) as HTMLButtonElement;
    const memory = screen.getByRole("tab", { name: "Bereich: Memory" }) as HTMLButtonElement;
    const diagnostics = screen.getByRole("tab", { name: "Bereich: Diagnose" }) as HTMLButtonElement;
    expect(chat.tabIndex).toBe(0);
    expect(cron.tabIndex).toBe(-1);
    chat.focus();
    fireEvent.keyDown(chat, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cron);
    fireEvent.keyDown(cron, { key: "ArrowRight" });
    expect(document.activeElement).toBe(skills);
    fireEvent.keyDown(skills, { key: "End" });
    expect(document.activeElement).toBe(diagnostics);
    fireEvent.keyDown(diagnostics, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Bereich: Konfiguration" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(memory);
    fireEvent.keyDown(memory, { key: "Home" });
    expect(document.activeElement).toBe(chat);
  });

  it("markiert den aktiven Bereich nur über aria-selected, ohne eigene Fläche", () => {
    render(<HermesV2AreaNav area="chat" onSelect={vi.fn()} />);
    const chat = screen.getByRole("tab", { name: "Bereich: Chat" });
    const cron = screen.getByRole("tab", { name: "Bereich: Cron" });
    expect(chat.getAttribute("aria-selected")).toBe("true");
    // Kein eingefärbter Kasten: das Ziel trägt weder Inline-Farbe noch
    // zusätzliche Zustandsklassen, die Auswahl läuft über das Attribut.
    expect(chat.getAttribute("style")).toBeNull();
    expect(chat.className).toBe("hermesv2-areanav-target");
    expect(cron.getAttribute("style")).toBeNull();
  });

  it("lässt die Icons die Textfarbe des Ziels erben", () => {
    render(<HermesV2AreaNav area="chat" onSelect={vi.fn()} />);
    for (const name of ["Chat", "Cron", "Skills", "Memory", "Konfiguration", "Diagnose"]) {
      const icon = screen.getByRole("tab", { name: `Bereich: ${name}` }).querySelector("svg");
      const inline = (icon?.getAttribute("style") ?? "").toLowerCase();
      // currentColor oder keine Angabe: das Icon bringt keine eigene Farbe
      // mit und kann so allein die Akzentfarbe des aktiven Bereichs zeigen.
      expect(inline === "" || inline.includes("currentcolor")).toBe(true);
    }
  });

  it("hält im kompakten Modus den Bereichspicker mit weiteren Bereichen offen", () => {
    render(<HermesV2AreaNav area="chat" onSelect={vi.fn()} compact />);
    const more = screen.getByRole("tab", { name: "Weitere Hermes-Bereiche" });
    expect(more.getAttribute("aria-selected")).toBe("false");
    expect(screen.queryByRole("tab", { name: "Bereich: Diagnose" })).toBeNull();
    fireEvent.click(more);
    expect(screen.getByRole("dialog", { name: "Weitere Bereiche" })).toBeTruthy();
  });
});
