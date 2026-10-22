// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HermesV2Memory,
  HermesV2Pending,
  HermesV2ResourceSkill,
  HermesV2ResourceSkillDetail,
  HermesV2ResourceSkills,
} from "@wrapt/contracts/hermes-v2";
import { MemoryRouter } from "react-router";
import { HermesV2SkillsArea } from "./HermesV2SkillsArea";
import { HermesV2MemoryArea } from "./HermesV2MemoryArea";
import { errorRead, idleRead, makeResourceFixture, readyRead } from "./resource-fixtures";

const skill: HermesV2ResourceSkill = {
  name: "tagesbericht",
  description: "Erzeugt einen Tagesbericht",
  enabled: true,
  usage: 3,
  provenance: "agent",
  slashCommand: "tagesbericht",
  readOnly: true,
};

const skillList: HermesV2ResourceSkills = {
  scope: "0".repeat(64),
  skills: [skill],
  truncated: false,
  editorPath: "/ki-skills",
};

const skillDetail: HermesV2ResourceSkillDetail = {
  scope: "0".repeat(64),
  skill,
  content: { text: "# Tagesbericht", status: "available", bytes: 15, truncated: true },
  editorPath: "/ki-skills",
};

const memory: HermesV2Memory = {
  scope: "0".repeat(64),
  active: null,
  providers: [{ name: "builtin", description: "Markdown-Dateien", available: true, configured: null, status: null, setup: null }],
  files: [
    { name: "MEMORY.md", text: null, status: "missing", bytes: null, truncated: false },
    { name: "USER.md", text: "", status: "empty", bytes: 0, truncated: false },
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
      action: "append",
      summary: "Neue Notiz hinzufügen",
      origin: "background_review",
      createdAt: 1760000000000,
      payload: { text: "…notiz", status: "available", bytes: 7, truncated: true },
      matchedEntryComplete: false,
      truncated: false,
    },
  ],
  coverage: "bounded",
  truncated: false,
  review: { supported: false, adminPath: "/hermes" },
};

const bodyText = () => document.body.textContent ?? "";

afterEach(cleanup);

describe("HermesV2SkillsArea", () => {
  it("baut Katalog und Details als Abschnitte einer Verwaltungsseite.", () => {
    const fixture = makeResourceFixture({
      skills: { list: readyRead(skillList), selectedName: null, detail: idleRead() },
    } as never);
    render(<MemoryRouter><HermesV2SkillsArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Skills" }).getAttribute("data-hermes-area")).toBe("skills");
    expect(screen.getByRole("region", { name: "Katalog" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Details" })).toBeTruthy();
  });

  it("Die Suche deckt Beschreibung, Namen und Slashbefehl ab.", () => {
    const selectSkill = vi.fn();
    const fixture = makeResourceFixture({
      skills: { list: readyRead(skillList), selectedName: null, detail: idleRead() },
      selectSkill,
    } as never);
    render(<MemoryRouter><HermesV2SkillsArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByLabelText("Skill: tagesbericht")).toBeTruthy();
    const suchfeld = screen.getByLabelText(/Skills nach Beschreibung/);
    fireEvent.change(suchfeld, { target: { value: "klingelbeere" } });
    expect(screen.getByText(/Keine Treffer/)).toBeTruthy();
    fireEvent.change(suchfeld, { target: { value: "erzeugt" } });
    expect(screen.getByLabelText("Skill: tagesbericht")).toBeTruthy();
    fireEvent.change(suchfeld, { target: { value: "tagesbericht" } });
    fireEvent.change(suchfeld, { target: { value: "slashlos" } });
    expect(screen.getByText(/Keine Treffer/)).toBeTruthy();
    fireEvent.change(suchfeld, { target: { value: "tagesbericht" } });
    fireEvent.click(screen.getByLabelText("Skill: tagesbericht"));
    expect(selectSkill).toHaveBeenCalledWith("tagesbericht");
  });

  it("Details bleiben read-only und öffnen den vorhandenen Editor.", () => {
    const fixture = makeResourceFixture({
      skills: { list: readyRead(skillList), selectedName: "tagesbericht", detail: readyRead(skillDetail) },
    } as never);
    render(<MemoryRouter><HermesV2SkillsArea resources={fixture} /></MemoryRouter>);
    const body = document.body.textContent ?? "";
    expect(body).toContain("Agent");
    expect(body).toContain("gekürzt");
    expect(screen.queryByRole("button", { name: /Aktivieren/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Im KI-Skills-Editor öffnen" })).toBeTruthy();
  });
});

describe("HermesV2MemoryArea", () => {
  it("unterscheidet fehlend, leer und gekürzt bei den builtin-Dateien.", () => {
    const fixture = makeResourceFixture({
      memory: readyRead(memory),
      pending: readyRead(pending),
    } as never);
    render(<MemoryRouter><HermesV2MemoryArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByText(/Inhalt fehlt nativ\./)).toBeTruthy();
    expect(screen.getByText(/Inhalt ist leer\./)).toBeTruthy();
    expect(screen.getByText(/kein voller Beleg/)).toBeTruthy();
    expect(screen.queryByText(/Builtin-Export/)).toBeNull();
  });

  it("Freigeben und Ablehnen bleiben ehrlich disabled mit Classic-Link.", () => {
    const fixture = makeResourceFixture({
      pending: readyRead(pending),
    } as never);
    render(<MemoryRouter><HermesV2MemoryArea resources={fixture} /></MemoryRouter>);
    const buttons = screen.getAllByRole("button");
    const freigeben = buttons.find((button) => (button.textContent ?? "").startsWith("Freigeben:")) as HTMLButtonElement;
    const ablehnen = buttons.find((button) => (button.textContent ?? "").startsWith("Ablehnen:")) as HTMLButtonElement;
    expect(freigeben.disabled).toBe(true);
    expect(ablehnen.disabled).toBe(true);
    for (const control of [freigeben, ablehnen]) {
      expect(control.getAttribute("title") ?? "").toMatch(/nicht unterstützt/);
    }
    expect(screen.getByRole("link", { name: "Hermes-Verwaltung öffnen" })).toBeTruthy();
  });

  it("Fehler bleiben sichtbar statt stiller Leere.", () => {
    const fixture = makeResourceFixture({
      memory: errorRead({ code: "RESOURCE_UNAVAILABLE", message: "Memory-Beleg fehlgeschlagen.", outcome: "unknown" }),
    } as never);
    render(<MemoryRouter><HermesV2MemoryArea resources={fixture} /></MemoryRouter>);
    expect(screen.getByText(/Memory-Beleg fehlgeschlagen\./)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Memory aktualisieren" }).length).toBeGreaterThan(0);
  });

  it("belegt Herkunft, Aktion und Zeitpunkt des nativen Vorschlags.", () => {
    const fixture = makeResourceFixture({ pending: readyRead(pending) } as never);
    render(<MemoryRouter><HermesV2MemoryArea resources={fixture} /></MemoryRouter>);
    expect(bodyText()).toContain("Aus Hintergrundprüfung");
    expect(bodyText()).toContain("Aktion append");
    expect(bodyText()).toContain("Zeitpunkt");
    // Ein unvollständiger matched_entry ist sichtbar unvollständig.
    expect(bodyText()).toContain("unvollständig");
  });
});
