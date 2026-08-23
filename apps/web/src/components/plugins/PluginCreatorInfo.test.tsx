// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginCreatorInfo } from "./PluginCreatorInfo";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock("../../lib/apiClient", () => ({
  apiClient: { pluginCreatorSkill: mocks.read },
}));

describe("PluginCreatorInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({
      fileName: "SKILL.md",
      content: "---\nname: plugin-creator\n---\n\n# Plugin Creator",
      modifiedAt: "2026-08-23T12:00:00.000Z",
      sizeBytes: 58,
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:skill") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  afterEach(cleanup);

  it("erklärt den Agenten-Flow und zeigt die echte Skill-Datei", async () => {
    render(<PluginCreatorInfo />);
    fireEvent.click(screen.getByRole("button", { name: "Mehr erfahren" }));
    expect(screen.getByRole("dialog", { name: "Plugin Creator" })).toBeTruthy();
    expect(screen.getByText("$plugin-creator Erstelle ein Plugin für …")).toBeTruthy();
    const viewButton = await screen.findByRole("button", { name: "Skill ansehen" });
    await waitFor(() => expect((viewButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(viewButton);
    expect(screen.getByText(/name: plugin-creator/)).toBeTruthy();
  });

  it("lädt die SKILL.md als normale Datei herunter", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<PluginCreatorInfo />);
    fireEvent.click(screen.getByRole("button", { name: "Mehr erfahren" }));
    const download = await screen.findByRole("button", { name: "SKILL.md herunterladen" });
    await waitFor(() => expect((download as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(download);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:skill");
    click.mockRestore();
  });

  it("zeigt eine fehlende konfigurierte Skill-Datei verständlich an", async () => {
    mocks.read.mockRejectedValue(new Error("Der Plugin-Creator-Skill wurde nicht gefunden."));
    render(<PluginCreatorInfo />);
    fireEvent.click(screen.getByRole("button", { name: "Mehr erfahren" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Der Plugin-Creator-Skill wurde nicht gefunden.");
    expect((screen.getByRole("button", { name: "Skill ansehen" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
