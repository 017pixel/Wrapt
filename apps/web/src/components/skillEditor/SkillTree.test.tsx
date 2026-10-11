// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkillEditorFile, SkillEditorTreeResponse } from "@wrapt/contracts";
import { SkillTree } from "./SkillTree";

function file(path: string, name: string, overrides: Partial<SkillEditorFile> = {}): SkillEditorFile {
  return { name, path, kind: "file", sizeBytes: 12, modifiedAt: "2026-01-01T10:00:00.000Z", symlink: false, broken: false, editable: true, ...overrides };
}

const tree: SkillEditorTreeResponse = {
  rootDirectory: "/root",
  agentsFile: file("/root/AGENTS.md", "AGENTS.md"),
  ruleEntries: [
    { id: "agents", label: "AGENTS.md", path: "/root/AGENTS.md", editable: true, symlinkTarget: null },
    { id: "global", label: "Globale Hinweise", path: "/root/HINWEISE.md", editable: true, symlinkTarget: "/repo/HINWEISE.md" },
  ],
  skills: [
    {
      name: "alpha",
      path: "/root/skills/alpha",
      description: "Erster Skill",
      modifiedAt: "2026-01-01T10:00:00.000Z",
      symlink: true,
      broken: false,
      files: [file("/root/skills/alpha/SKILL.md", "SKILL.md"), file("/root/skills/alpha/references", "references", { kind: "directory", editable: false })],
    },
    { name: "kaputt", path: "/root/skills/kaputt", description: null, modifiedAt: null, symlink: true, broken: true, files: [] },
    { name: "stumm", path: "/root/skills/stumm", description: null, modifiedAt: null, symlink: false, broken: false, files: [file("/root/skills/stumm/SKILL.md", "SKILL.md")] },
  ],
  hermesSkills: [
    {
      name: "websuche",
      path: "/hermes/skills/suche/websuche",
      description: "Sucht im Netz",
      modifiedAt: "2026-01-01T10:00:00.000Z",
      symlink: false,
      broken: false,
      category: "suche",
      files: [file("/hermes/skills/suche/websuche/SKILL.md", "SKILL.md")],
    },
    {
      name: "planer",
      path: "/hermes/skills/planung/planer",
      description: null,
      modifiedAt: null,
      symlink: false,
      broken: false,
      category: "planung",
      files: [file("/hermes/skills/planung/planer/SKILL.md", "SKILL.md")],
    },
  ],
};

afterEach(cleanup);

function renderTree(selectedPath: string | null, handlers: Partial<Parameters<typeof SkillTree>[0]> = {}) {
  const props = {
    tree,
    selectedPath,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onCreateHermes: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...handlers,
  };
  render(<SkillTree {...props} />);
  return props;
}

describe("SkillTree", () => {
  it("zeigt drei Gruppen mit Zählern", () => {
    renderTree(null);
    expect(screen.getByText("Globale Regeln (2)")).toBeTruthy();
    expect(screen.getByText("Skills (3)")).toBeTruthy();
    expect(screen.getByText("Hermes-Skills (2)")).toBeTruthy();
  });

  it("zeigt die globalen Regeln, die Skills und deren Beschreibung", () => {
    renderTree(null);
    expect(screen.getByText("AGENTS.md")).toBeTruthy();
    expect(screen.getByText("Globale Hinweise")).toBeTruthy();
    expect(screen.getByText("Erster Skill")).toBeTruthy();
    expect(screen.getByText("Der Verweis zeigt ins Leere.")).toBeTruthy();
  });

  it("klappt einen Skill auf und meldet die gewählte Datei", () => {
    const props = renderTree(null);
    const toggle = screen.getByRole("button", { name: "alpha aufklappen" });
    const branch = toggle.closest(".skill-tree-branch") as HTMLElement;
    fireEvent.click(toggle);
    fireEvent.click(within(branch).getByText("SKILL.md"));
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: "/root/skills/alpha/SKILL.md" }));
  });

  it("öffnet keinen Ordner als Datei", () => {
    const props = renderTree(null);
    const toggle = screen.getByRole("button", { name: "alpha aufklappen" });
    const branch = toggle.closest(".skill-tree-branch") as HTMLElement;
    fireEvent.click(toggle);
    fireEvent.click(within(branch).getByText("references"));
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("hält den Zweig der ausgewählten Datei offen", () => {
    renderTree("/root/skills/alpha/SKILL.md");
    expect(screen.getByRole("button", { name: "alpha einklappen" })).toBeTruthy();
    const branch = screen.getByRole("button", { name: "alpha einklappen" }).closest(".skill-tree-branch") as HTMLElement;
    expect(within(branch).getByText("SKILL.md")).toBeTruthy();
  });

  it("kennzeichnet einen kaputten Verweis und bietet nur Löschen an", () => {
    const props = renderTree(null);
    fireEvent.click(screen.getByRole("button", { name: "kaputt aufklappen" }));
    expect(screen.getByText("Ziel nicht gefunden. Der Skill lässt sich nur noch löschen.")).toBeTruthy();
    expect(screen.getByText("defekt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "kaputt umbenennen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "kaputt löschen" }));
    expect(props.onDelete).toHaveBeenCalledWith(expect.objectContaining({ name: "kaputt" }), "skills");
  });

  it("meldet Umbenennen und Neuanlage", () => {
    const props = renderTree(null);
    fireEvent.click(screen.getByRole("button", { name: "alpha umbenennen" }));
    expect(props.onRename).toHaveBeenCalledWith(expect.objectContaining({ name: "alpha" }), "skills");
    fireEvent.click(screen.getByRole("button", { name: "Neuen Skill anlegen" }));
    expect(props.onCreate).toHaveBeenCalled();
  });

  it("zeigt Regeln ohne Aktionen und öffnet sie per Klick", () => {
    const props = renderTree(null);
    fireEvent.click(screen.getByText("Globale Hinweise"));
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: "/root/HINWEISE.md" }));
    const rulesGroup = screen.getByText("Globale Regeln (2)").closest("section");
    expect(rulesGroup?.querySelector('[aria-label$="umbenennen"], [aria-label$="löschen"]')).toBeNull();
  });

  it("sperrt nicht lesbare Regeldateien statt sie zu öffnen", () => {
    const props = renderTree(null, {
      tree: {
        ...tree,
        ruleEntries: [
          { id: "fehlt", label: "Fehlende Regel", path: "/root/FEHLT.md", editable: false, symlinkTarget: null },
        ],
      },
    });
    const row = screen.getByText("Fehlende Regel").closest(".skill-tree-row") as HTMLElement;
    expect(row.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByText("Fehlende Regel"));
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("gruppiert Hermes-Skills nach Kategorie mit eigenem Anlegen-Knopf", () => {
    const props = renderTree(null);
    expect(screen.getByText("planung")).toBeTruthy();
    expect(screen.getByText("suche")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hermes-Skill anlegen" }));
    expect(props.onCreateHermes).toHaveBeenCalled();
  });

  it("ruft Umbenennen und Löschen bei Hermes mit scope hermes auf", () => {
    const props = renderTree(null);
    fireEvent.click(screen.getByRole("button", { name: "websuche umbenennen" }));
    expect(props.onRename).toHaveBeenCalledWith(expect.objectContaining({ name: "websuche" }), "hermes");
    fireEvent.click(screen.getByRole("button", { name: "websuche löschen" }));
    expect(props.onDelete).toHaveBeenCalledWith(expect.objectContaining({ name: "websuche" }), "hermes");
  });

  it("zeigt ohne-Beschreibung-Badge als Hinweis", () => {
    renderTree(null);
    expect(screen.getAllByText("ohne Beschreibung").length).toBeGreaterThan(0);
  });

  it("filtert die Suche über alle Gruppen und öffnet Treffer automatisch", () => {
    renderTree(null, { query: "websuche" });
    expect(screen.getByText("websuche")).toBeTruthy();
    expect(screen.getByText("SKILL.md")).toBeTruthy();
    expect(screen.queryByText("alpha")).toBeNull();
  });

  it("meldet leere Treffer auf Deutsch", () => {
    renderTree(null, { query: "gibt-es-nicht" });
    expect(screen.getByText("Kein Skill passt auf „gibt-es-nicht“.")).toBeTruthy();
  });
});
