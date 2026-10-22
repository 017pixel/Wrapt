// UItests Composergebiet: Slashpalette mit Keyboard/IME, Unsupported und Chips.
// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chatFixture,
  command,
  composerSettings,
  notices,
  renderArea,
  snapshot,
  textbox,
} from "./composer-area-fixtures";

describe("HermesV2ComposerArea – Slashpalette", () => {
  afterEach(cleanup);

  it("öffnet mit Slashbackdraft, zeigt kanonische Keys und Texte", () => {
    renderArea(chatFixture(), { draft: "/mod" });
    const list = screen.getByRole("listbox", { name: "Hermes-Befehle" });
    expect(list).toBeTruthy();
    expect(
      list.querySelector("[role='option'][data-slash-key='/model']"),
    ).toBeTruthy();
    expect(list.textContent).toContain("/model");
  });

  it("öffnet ohne Slashbeginn nicht und kennt keinen eigenen Befehlsknopf", () => {
    renderArea(chatFixture(), { draft: "Eigener freier Text" });
    expect(
      screen.queryByRole("listbox", { name: "Hermes-Befehle" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Befehle" })).toBeNull();
    expect(screen.queryByText("/")).toBeNull();
  });

  it("trägt die Skillanweisung bei Enter ein, ohne zu senden", () => {
    const chat = chatFixture();
    renderArea(chat, { draft: "/res" });
    fireEvent.keyDown(textbox(), { key: "ArrowDown" });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(chat.setDraft).toHaveBeenCalledWith(
      expect.stringContaining('Verwende den Hermes-Skill "research-test"'),
    );
    expect(chat.submit).not.toHaveBeenCalled();
  });

  it("pfeilt, Bestätigt und IME wie versprochen: Composition-Enter trifft keine Palette", () => {
    const chat = chatFixture();
    renderArea(chat, { draft: "/mo" });
    fireEvent.keyDown(textbox(), { key: "ArrowDown" });
    fireEvent.compositionStart(textbox());
    fireEvent.keyDown(textbox(), { key: "Enter", isComposing: true });
    expect(chat.submit).not.toHaveBeenCalled();
    expect(chat.setDraft).not.toHaveBeenCalled();
  });

  it("unsupported zeigt den echten Grund mit Classiclink, ohne heimlichen Versand", () => {
    const chat = chatFixture();
    renderArea(chat, { draft: "/for" });
    fireEvent.keyDown(textbox(), { key: "ArrowDown" });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    const visible = notices().some((text) =>
      text.includes("Nur in der klassischen Oberfläche"),
    );
    expect(visible).toBe(true);
    expect(
      document.querySelector(".hermesv2-slash-notice a")?.getAttribute("href"),
    ).toContain("hermes-agent");
    expect(chat.submit).not.toHaveBeenCalled();
  });

  it("führt den Klassiklink der Notiz über den Routerbasispfad", () => {
    const chat = chatFixture();
    renderArea(chat, {
      draft: "/for",
      basename: "/wrapt",
    });
    fireEvent.keyDown(textbox(), { key: "ArrowDown" });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    const link = document.querySelector(".hermesv2-slash-notice a");
    expect(link?.getAttribute("href")).toBe(
      "/wrapt/hermes-agent?ui=classic&session=s1",
    );
  });

  it("sperrt rohe Slashzeilen über Senden und Enter auch nach Escape", () => {
    const chat = chatFixture();
    renderArea(chat, { draft: "/modelx" });
    const input = textbox();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(chat.submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    // Bewusst geschlossen, der rohe Slash bleibt trotzdem gesperrt.
    expect(
      screen.queryByRole("listbox", { name: "Hermes-Befehle" }),
    ).toBeNull();
    const send = screen.getByRole("button", { name: "Senden" });
    expect(send.hasAttribute("disabled")).toBe(true);
    expect(send.getAttribute("title")).toContain("Slash");
  });

  it("/resume läuft über den freigegebenen Shellcallback", () => {
    const chat = chatFixture({
      activeSnapshot: snapshot({
        catalog: {
          commands: [command({ key: "/resume", action: "resume" })],
          models: null,
          loading: false,
          error: null,
        },
      }),
    });
    const onOpenSessions = vi.fn();
    renderArea(chat, { draft: "/resume", onOpenSessions });
    fireEvent.keyDown(textbox(), { key: "ArrowDown" });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(onOpenSessions).toHaveBeenCalledTimes(1);
    expect(chat.setDraft).toHaveBeenCalledWith("");
  });

  it("/help bleibt über die Palette erreichbar", () => {
    const chat = chatFixture({
      activeSnapshot: snapshot({
        catalog: {
          commands: [command({ key: "/help", action: "help" })],
          models: null,
          loading: false,
          error: null,
        },
      }),
    });
    renderArea(chat, { draft: "/help" });
    fireEvent.keyDown(textbox(), { key: "ArrowDown" });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(
      screen.getByRole("dialog", { name: "Hilfe: Hermes-Befehle" }),
    ).toBeTruthy();
  });
});

describe("HermesV2ComposerArea – Chips", () => {
  afterEach(cleanup);

  it("hat keinen Umbenennen-Knopf mehr im Composer", () => {
    renderArea(chatFixture());
    expect(
      screen.queryByRole("button", { name: "Sitzung umbenennen" }),
    ).toBeNull();
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("schaltet den Freigabemodus über das Chipmenü", () => {
    const chat = chatFixture();
    renderArea(chat);
    fireEvent.click(screen.getByRole("button", { name: "Freigabe wählen" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Bypass" }));
    expect(chat.setApprovalMode).toHaveBeenCalledWith("off");
  });

  it("bleibt ohne belegte Optionen lesbar statt schaltbar", () => {
    const settings = composerSettings();
    const chat = chatFixture({
      composerPatch: {
        settings: {
          ...settings,
          approvals: { ...settings.approvals, options: [] },
        },
      },
    });
    renderArea(chat);
    expect(
      screen.queryByRole("button", { name: "Freigabe wählen" }),
    ).toBeNull();
    expect(screen.getByText("Nachfragen")).toBeTruthy();
  });

  it("zeigt einen aktiven Bypass sichtbar an", () => {
    const settings = composerSettings();
    const chat = chatFixture({
      composerPatch: {
        settings: {
          ...settings,
          approvals: {
            ...settings.approvals,
            mode: "off",
            effectiveBypass: true,
          },
        },
      },
    });
    renderArea(chat);
    const chip = screen.getByText("Bypass").closest(".hermesv2-approval-chip");
    expect(chip?.getAttribute("data-bypass")).toBe("true");
  });

  it("erklärt die gesperrte Denktiefe am Chip statt als sichtbare Zeile", () => {
    const chat = chatFixture({ activeSnapshot: snapshot({ running: true }) });
    renderArea(chat);
    const chip = screen.getByRole("button", { name: "Denktiefe" });
    expect(chip.getAttribute("title")).toContain(
      "Während des laufenden Turns",
    );
    expect(document.body.textContent).not.toContain(
      "Während des laufenden Turns bleibt die Denktiefe unverändert.",
    );
  });
});
