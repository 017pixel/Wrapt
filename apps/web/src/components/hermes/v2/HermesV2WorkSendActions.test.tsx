// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2WorkSendActions } from "./HermesV2WorkSendActions";
import { workChat } from "./work-panel-fixtures";

afterEach(cleanup);

const more = "Weitere Aktionen";

/** Das Überlaufmenü öffnet die bewussten Aktionen; nichts läuft vorher. */
function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: more }));
}

describe("Bewusste Aufgabenaktionen im Composer", () => {
  it("zeigt ohne Sitzung keine Aktion", () => {
    render(<HermesV2WorkSendActions chat={workChat()} snapshot={null} value="Eigener Text" running={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("startet aus Eingabeänderungen keine native Aktion", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const chat = workChat({ available: true }, { startBackground: start });
    const { rerender } = render(<HermesV2WorkSendActions chat={chat} snapshot={chat.activeSnapshot} value="Erster Entwurf" running={false} />);
    rerender(<HermesV2WorkSendActions chat={chat} snapshot={chat.activeSnapshot} value="Zweiter Entwurf" running={false} />);
    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("sendet Steer und Queue nur über den jeweiligen bewussten Klick", () => {
    const submit = vi.fn().mockResolvedValue(undefined), change = vi.fn().mockResolvedValue(undefined);
    const chat = workChat({ available: true }, { draft: "Eigener aktueller Entwurf", submit, steer: change });
    render(<HermesV2WorkSendActions chat={chat} snapshot={chat.activeSnapshot} value="Älterer Rendertext" running />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Einreihen" }));
    expect(submit).toHaveBeenCalledExactlyOnceWith("Eigener aktueller Entwurf", "queue");
    expect(change).not.toHaveBeenCalled();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Steuern" }));
    expect(change).toHaveBeenCalledExactlyOnceWith("Eigener aktueller Entwurf");
  });

  it.each([false, true])("verwendet für Hintergrund und Zwischenauftrag eigene Domainaktionen, running=%s", (running) => {
    const start = vi.fn().mockResolvedValue(undefined), aside = vi.fn().mockResolvedValue(undefined);
    const submit = vi.fn().mockResolvedValue(undefined);
    const chat = workChat({ available: true }, { draft: "Eigene Nebenfrage", startBackground: start, startBtw: aside, submit });
    render(<HermesV2WorkSendActions chat={chat} snapshot={chat.activeSnapshot} value="" running={running} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Hintergrund" }));
    // Die Aktion schließt das Menü; der zweite Punkt öffnet es erneut.
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Zwischenauftrag" }));
    expect(start).toHaveBeenCalledExactlyOnceWith("Eigene Nebenfrage");
    expect(aside).toHaveBeenCalledExactlyOnceWith("Eigene Nebenfrage");
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "/queue Eigene Folge", "/steer Eigene Steuerung"])("sperrt leeren oder rohen Slashtext %j", (value) => {
    const chat = workChat({ available: true }, { draft: value });
    render(<HermesV2WorkSendActions chat={chat} snapshot={chat.activeSnapshot} value={value} running />);
    openMenu();
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveProperty("disabled", true);
    }
  });

  it("sperrt sämtliche Textaktionen ohne aktive Onlineverbindung", () => {
    const base = workChat({ available: true }, { draft: "Eigener Text" });
    const chat = { ...base, connection: { ...base.connection, state: "offline" as const } };
    render(<HermesV2WorkSendActions chat={chat} snapshot={chat.activeSnapshot} value="Eigener Text" running />);
    openMenu();
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveProperty("disabled", true);
      expect(item.getAttribute("title")).toBe("Keine Verbindung zu Hermes.");
    }
  });

  it("behandelt read-only Sitzung unabhängig vom laufenden Hauptturn", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const chat = workChat({ available: true }, { draft: "Eigener Text", startBtw: start });
    render(<HermesV2WorkSendActions chat={chat} snapshot={{ ...chat.activeSnapshot!, writable: false }} value="Eigener Text" running />);
    openMenu();
    const item = screen.getByRole("menuitem", { name: "Zwischenauftrag" });
    expect(item).toHaveProperty("disabled", true);
    fireEvent.click(item);
    expect(start).not.toHaveBeenCalled();
  });

  it("trägt den Sperrgrund am Menüpunkt, ohne sichtbare Warnzeile", () => {
    const chat = workChat({ available: true }, { draft: "" });
    render(<HermesV2WorkSendActions chat={chat} snapshot={chat.activeSnapshot} value="" running />);
    openMenu();
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveProperty("disabled", true);
      expect(item.getAttribute("title")).toBe(
        "Dafür ist normaler Text im Sendefeld nötig.",
      );
    }
    expect(document.body.textContent).not.toContain(
      "Dafür ist normaler Text im Sendefeld nötig.",
    );
  });
});
