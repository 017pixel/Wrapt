// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPluginDraft } from "./pluginDefaults";
import { PluginAiWizard } from "./PluginAiWizard";

afterEach(cleanup);

function WizardHarness({ onChange, onComplete }: { onChange: (draft: ReturnType<typeof emptyPluginDraft>) => void; onComplete: () => void }) {
  const [draft, setDraft] = useState(emptyPluginDraft());
  return <MemoryRouter><PluginAiWizard draftId="11111111-1111-4111-8111-111111111111" draft={draft} onChange={(next) => { onChange(next); setDraft(next); }} onClose={vi.fn()} onComplete={onComplete} /></MemoryRouter>;
}

function renderWizard(onComplete = vi.fn()) {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const onChange = vi.fn();
  render(<WizardHarness onChange={onChange} onComplete={onComplete} />);
  return { onChange, onComplete, writeText };
}

function goToStep(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("KI-Plugin-Setup", () => {
  it("fragt die Plugin-Grundlagen und den Inhaltsmodus vor dem Prompt ab", () => {
    const { onChange } = renderWizard();

    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Slug")).toBeTruthy();
    expect(screen.getByLabelText("Beschreibung")).toBeTruthy();
    expect(screen.getByLabelText("Kategorie")).toBeTruthy();
    expect(screen.getByLabelText("Inhaltsmodus")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(25);
    expect(screen.getByLabelText("Icon-Wunsch")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Release Board" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Release Board", creationMode: "ai" }));

    fireEvent.change(screen.getByLabelText("Inhaltsmodus"), { target: { value: "iframe" } });
    expect(screen.getByLabelText("Externe Iframe-URL")).toBeTruthy();
  });

  it("übernimmt Icon-Wunsch und Code-Icon in den KI-Draft", () => {
    const { onChange } = renderWizard();

    fireEvent.change(screen.getByLabelText("Icon-Wunsch"), { target: { value: "Eine Uhr für Fokus" } });
    fireEvent.change(screen.getByLabelText("Eigenes Icon-Codewort"), { target: { value: "clock" } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      icon: "clock",
      wizard: expect.objectContaining({ iconDescription: "Eine Uhr für Fokus" }),
    }));
  });

  it("zeigt vor dem Prompt eine Live-Vorschau", () => {
    renderWizard();

    goToStep("Vorschau");

    expect(screen.getByRole("region", { name: "Plugin-Vorschau" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vorschau öffnen" })).toBeTruthy();
  });

  it("erklärt die sichtbare Standardseite eindeutig und hält Orbit synchron", () => {
    const { onChange } = renderWizard();

    goToStep("Einsatzort");
    const sidebar = screen.getByRole("checkbox", { name: /Seite in der Sidebar/i });
    expect((sidebar as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText("Eigene Seite")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: /Orbit/i }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      surfaces: expect.arrayContaining(["page", "sidebar", "orbit"]),
      orbit: expect.objectContaining({ enabled: true }),
      wizard: expect.objectContaining({ includeOrbit: true }),
    }));
  });

  it("führt nach dem Kopieren nur noch in den Abschluss mit Übersicht-Link", async () => {
    const { onComplete, writeText } = renderWizard();

    goToStep("Prompt");
    fireEvent.click(screen.getByRole("button", { name: "Prompt kopieren" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Wrapt-Plugin-Agent")));
    const copiedPrompt = writeText.mock.calls[0]?.[0] as string;
    expect(copiedPrompt).toContain("11111111-1111-4111-8111-111111111111");
    expect(copiedPrompt).not.toContain("Wenn dieser Prompt kopiert wurde");
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Prompt ist bereit")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Prompt kopieren" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Zur Plugin-Übersicht" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("trennt zusätzliche Anforderungen und Neustart-Freigabe von den Rechten", () => {
    renderWizard();
    goToStep("Rechte");

    expect(screen.getByLabelText("Weitere Anforderungen")).toBeTruthy();
    expect(screen.getByLabelText("Neustart-Verhalten")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Weitere Anforderungen"), { target: { value: "Die Seite muss auch auf dem Handy vollständig bedienbar sein." } });
    fireEvent.change(screen.getByLabelText("Neustart-Verhalten"), { target: { value: "never" } });
    expect((screen.getByLabelText("Weitere Anforderungen") as HTMLTextAreaElement).value).toBe("Die Seite muss auch auf dem Handy vollständig bedienbar sein.");
    expect((screen.getByLabelText("Neustart-Verhalten") as HTMLSelectElement).value).toBe("never");
  });
});
