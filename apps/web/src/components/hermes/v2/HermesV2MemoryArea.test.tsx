// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HermesV2Memory, HermesV2Pending } from "@wrapt/contracts/hermes-v2";
import { MemoryRouter } from "react-router";
import { HermesV2MemoryArea } from "./HermesV2MemoryArea";
import { errorRead, makeResourceFixture, readyRead } from "./resource-fixtures";

const longText = "Zeile mit Inhalt\n".repeat(200);

const memory: HermesV2Memory = {
  scope: "0".repeat(64),
  active: "builtin",
  providers: [
    {
      name: "builtin",
      description: "Markdown-Dateien",
      available: false,
      configured: true,
      status: "unavailable",
      setup: null,
    },
  ],
  files: [
    { name: "MEMORY.md", text: longText, status: "available", bytes: longText.length, truncated: false },
    { name: "USER.md", text: "kurz", status: "available", bytes: 4, truncated: false },
  ],
  builtinOnly: true,
  truncated: false,
};

const pending: HermesV2Pending = {
  scope: "0".repeat(64),
  records: [
    {
      id: "abcd1234",
      subsystem: "memory",
      status: "pending",
      action: "add",
      summary: "Neue Notiz",
      origin: "background_review",
      createdAt: 1760000000000,
      payload: { text: '{"action":"add","content":"Notiz"}', status: "available", bytes: 33, truncated: false },
      matchedEntryComplete: false,
      truncated: false,
    },
  ],
  coverage: "bounded",
  truncated: false,
  review: { supported: false, adminPath: "/hermes" },
};

afterEach(cleanup);

const filePreview = (name: string) =>
  document.querySelector(`[data-hermes-memory-file="${name}"] [data-expanded]`);

describe("HermesV2MemoryArea", () => {
  it("zeigt Dateien breit und Anbieter kompakt in zwei Spalten.", () => {
    const fixture = makeResourceFixture({ memory: readyRead(memory) } as never);
    render(<MemoryRouter><HermesV2MemoryArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Memory-Belege" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Dateien" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Anbieter" })).toBeTruthy();
    expect(screen.getByText("MEMORY.md")).toBeTruthy();
    expect(screen.getByText("USER.md")).toBeTruthy();
  });

  it("nennt Name, Beschreibung und Zustand der Anbieter.", () => {
    const fixture = makeResourceFixture({ memory: readyRead(memory) } as never);
    render(<MemoryRouter><HermesV2MemoryArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByText("builtin")).toBeTruthy();
    expect(screen.getByText("Markdown-Dateien")).toBeTruthy();
    expect(screen.getByText("nicht verfügbar · konfiguriert · unavailable")).toBeTruthy();
  });

  it("begrenzt die Dateivorschau und klappt lange Texte auf.", () => {
    const fixture = makeResourceFixture({ memory: readyRead(memory) } as never);
    render(<MemoryRouter><HermesV2MemoryArea resources={fixture} /></MemoryRouter>);
    expect(filePreview("MEMORY.md")?.getAttribute("data-expanded")).toBe("false");
    const mehr = screen.getByRole("button", { name: "Mehr anzeigen" });
    fireEvent.click(mehr);
    expect(filePreview("MEMORY.md")?.getAttribute("data-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Weniger anzeigen" })).toBeTruthy();
    // Der kurze Text bleibt ohne Zusatzknopf.
    expect(screen.queryAllByRole("button", { name: "Mehr anzeigen" }).length).toBe(0);
  });

  it("begrenzt den JSON-Beleg der Schreibvorschläge und klappt ihn auf.", () => {
    const fixture = makeResourceFixture({
      memory: readyRead(memory),
      pending: readyRead(pending),
    } as never);
    render(<MemoryRouter><HermesV2MemoryArea resources={fixture} /></MemoryRouter>);
    const wrapper = document.querySelector("[data-hermes-memory-pending]");
    expect(wrapper?.getAttribute("data-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "JSON-Beleg aufklappen" }));
    expect(wrapper?.getAttribute("data-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "JSON-Beleg einkürzen" })).toBeTruthy();
  });

  it("meldet Lesefehler sichtbar und bietet das Neuladen an.", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const fixture = makeResourceFixture({
      memory: errorRead({ code: "RESOURCE_UNAVAILABLE", message: "Memory-Beleg fehlgeschlagen.", outcome: "unknown" }),
      refresh,
    } as never);
    render(<MemoryRouter><HermesV2MemoryArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByText("Memory-Beleg fehlgeschlagen.")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Memory aktualisieren" });
    expect(buttons.length).toBeGreaterThan(0);
    const last = buttons.at(-1);
    if (!last) throw new Error("kein Aktualisieren-Knopf");
    fireEvent.click(last);
    expect(refresh).toHaveBeenCalled();
  });
});
