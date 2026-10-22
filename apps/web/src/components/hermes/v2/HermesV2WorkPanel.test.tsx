// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2WorkPanel } from "./HermesV2WorkPanel";
import { actionView, delegationRow, processRow, subagentRow, taskRow, workChat, workView } from "./work-panel-fixtures";
import type { ChatWorkActionView, ChatWorkView } from "./chat-work-types";

afterEach(cleanup);

const base = (overrides: Partial<ChatWorkView> = {}) => workView({
  available: true, revision: 1, subagents: [subagentRow()],
  queue: { head: null, observed: true },
  coverage: { subagents: "live-and-observed", delegations: "recent-failures-partial",
    processes: "session", tasks: "observed-partial", queue: "next-only", truncated: false },
  ...overrides,
});

function showPanel() {
  const toggle = screen.queryByRole("button", { name: "Aufgaben anzeigen" });
  if (toggle) fireEvent.click(toggle);
  return screen.getByRole("region", { name: "Aufgabenansicht" });
}

function expandChild() {
  const toggle = screen.getByRole("button", { name: "Unteraufgabe aufklappen: Unteraufgabe recherchieren" });
  fireEvent.click(toggle);
  return toggle;
}

const tail = (key: string, status: ChatWorkActionView["status"], text: string | null) => actionView({
  key, action: "subagent.tail", targetId: "sa-1", status,
  result: status === "confirmed" ? { kind: "subagent.tail", id: "sa-1", available: text !== null,
    text: text ?? "", truncated: false } : null,
});

describe("Aufgabenansicht", () => {
  it("zeigt Prozessstatus ehrlich und verknüpft ihn mit dem Zeilenknopf", () => {
    render(<HermesV2WorkPanel chat={workChat(base({
      processes: [processRow(), processRow({
        id: "p2", command: "claude --doctor", status: "claude-cache-expired",
        exitCode: null, output: "",
      })],
    }))} />);
    showPanel();
    // Bekannter nativer Status mit gesprochenem Zustand; Toggle nutzt ihn als Beschreibung.
    const running = screen.getByRole("button", { name: "Prozess Details: pytest -q" });
    expect(running.getAttribute("aria-describedby")).toBeTruthy();
    const runningState = document.getElementById(running.getAttribute("aria-describedby")!);
    expect(runningState!.textContent).toBe("läuft");
    expect(runningState!.getAttribute("data-status")).toBe("running");
    // Unbekannter strukturierter Status bleibt ehrlich roh, nie erraten.
    const unknown = screen.getByRole("button", {
      name: "Prozess Details: claude --doctor",
    });
    const unknownState = document.getElementById(unknown.getAttribute("aria-describedby")!);
    expect(unknownState!.textContent).toBe("claude-cache-expired");
    expect(unknownState!.getAttribute("data-status")).toBe("unknown");
  });
  it("öffnet die bezeichnete Region und zeigt nur belegte Counts und Teilabdeckung", () => {
    render(<HermesV2WorkPanel chat={workChat(base({ counts: { subagents: 1, processes: null, tasks: null } }))} />);
    expect(screen.queryByRole("region", { name: "Aufgabenansicht" })).toBeNull();
    const region = showPanel();
    expect(screen.getByText("Unteraufgaben 1")).toBeTruthy();
    expect(screen.queryByText(/Prozesse 0|Nebenaufgaben 0/)).toBeNull();
    expect(within(region).getByText(/Teilabdeckung:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aufgaben ausblenden" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("versteckt Zeile, Zähler und Platzhalter ohne Aufgaben", () => {
    render(<HermesV2WorkPanel chat={workChat(base({ subagents: [] }))} />);
    // Ohne Aufgabenzeile bleibt die ganze Ansicht weg: kein Knopf, kein
    // Zähler, kein Platzhaltertext und kein leerer Bereich.
    expect(screen.queryByRole("button", { name: "Aufgaben anzeigen" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Aufgabenansicht" })).toBeNull();
    expect(document.body.textContent).toBe("");
  });

  it("hält einen eigenen Lesefehler auch ohne Aufgaben sichtbar", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<HermesV2WorkPanel chat={workChat(base({ subagents: [], error: { code: "GATEWAY_OFFLINE", message: "Eigener Lesefehler", outcome: "not_sent" } }), { refreshWork: refresh })} />);
    expect(screen.queryByRole("button", { name: "Aufgaben anzeigen" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Eigener Lesefehler");
    fireEvent.click(screen.getByRole("button", { name: "Erneut lesen" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("weist fehlende Verfügbarkeit aus und sperrt Aktualisieren", () => {
    render(<HermesV2WorkPanel chat={workChat(base({ available: false, revision: null, subagents: [subagentRow()] }))} />);
    showPanel();
    expect(screen.getByText("Aufgaben sind in dieser Fläche derzeit nicht verfügbar.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aufgaben aktualisieren" })).toHaveProperty("disabled", true);
  });

  it("zeigt nullable Metadaten ohne erfundene Laufzeit oder Werkzeugzahl", () => {
    render(<HermesV2WorkPanel chat={workChat(base({ subagents: [subagentRow({
      model: null, startedAt: null, durationMs: null, toolCount: null, lastTool: null, acceptingSteer: null,
    })] }))} />);
    showPanel(); expandChild();
    const row = screen.getByRole("button", { name: /Unteraufgabe unterbrechen:/ }).closest("[data-hermes-work-key]")!;
    expect(row.textContent).not.toMatch(/Werkzeugaufrufe|Dauer|gestartet|Modell/);
    expect(row.textContent).toContain("läuft");
  });

  it("unterscheidet gleiche Ziele und sendet genau die ausgewählte native Kennung", () => {
    const interrupt = vi.fn().mockResolvedValue(undefined);
    const rows = ["native-a", "native-b"].map((id) => subagentRow({ id, key: JSON.stringify(["subagent", id]), goal: "Gleiche Aufgabe" }));
    render(<HermesV2WorkPanel chat={workChat(base({ subagents: rows }), { interruptSubagent: interrupt })} />);
    showPanel();
    fireEvent.click(screen.getByRole("button", { name: "Unteraufgabe aufklappen: Gleiche Aufgabe (Kennung native-b)" }));
    fireEvent.click(screen.getByRole("button", { name: "Unteraufgabe unterbrechen: Gleiche Aufgabe (Kennung native-b)" }));
    expect(interrupt).toHaveBeenCalledExactlyOnceWith("native-b");
  });

  it("erhält getrennte Domänen und Delegationsindizes bei identischen Kennungen", () => {
    const { container } = render(<HermesV2WorkPanel chat={workChat(base({
      processes: [processRow({ id: "sa-1" })],
      delegations: [delegationRow({ delegationId: "sa-1", taskIndex: 0 }), delegationRow({ delegationId: "sa-1", taskIndex: 1 })],
      tasks: [taskRow({ id: "sa-1", kind: "background" }), taskRow({ id: "sa-1", kind: "btw", status: "completed" })],
    }))} />);
    showPanel();
    const keys = [...container.querySelectorAll("[data-hermes-work-key]")].map((row) => row.getAttribute("data-hermes-work-key"));
    expect(keys).toHaveLength(6);
    expect(new Set(keys).size).toBe(6);
    expect(screen.getByLabelText(/Nebenaufgabe Zwischenauftrag:/).textContent).toContain("fertig");
  });

  it("gibt zwei Oberflächen getrennte IDs für Region und Zeilendetails", () => {
    const { container } = render(<><HermesV2WorkPanel chat={workChat(base())} /><HermesV2WorkPanel chat={workChat(base())} /></>);
    for (const toggle of screen.getAllByRole("button", { name: "Aufgaben anzeigen" })) fireEvent.click(toggle);
    const controls = [...container.querySelectorAll("[aria-controls]")].map((button) => button.getAttribute("aria-controls"));
    expect(new Set(controls).size).toBe(controls.length);
    for (const id of controls) expect([...container.querySelectorAll("[id]")].filter((node) => node.id === id)).toHaveLength(1);
  });

  it("schließt lokale Zeilendetails bei neuer Snapshotgeneration und Verdeckung", () => {
    const chat = workChat(base());
    const { rerender } = render(<HermesV2WorkPanel chat={chat} active />);
    showPanel(); expandChild();
    rerender(<HermesV2WorkPanel chat={{ ...chat, activeSnapshot: { ...chat.activeSnapshot!, generation: 2 } }} active />);
    showPanel();
    expect(screen.getByRole("button", { name: /^Unteraufgabe aufklappen:/ }).getAttribute("aria-expanded")).toBe("false");
    expandChild();
    rerender(<HermesV2WorkPanel chat={chat} active={false} />);
    rerender(<HermesV2WorkPanel chat={chat} active />);
    showPanel();
    expect(screen.getByRole("button", { name: /^Unteraufgabe aufklappen:/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("reserviert nur den aktuellen Kindstop und zeigt found=false ehrlich", () => {
    const pending = actionView({ action: "subagent.interrupt", targetId: "sa-1", status: "pending", result: null });
    const chat = workChat(base({ actions: [pending] }));
    const { rerender } = render(<HermesV2WorkPanel chat={chat} />);
    showPanel(); expandChild();
    expect(screen.getByRole("button", { name: /^Unteraufgabe unterbrechen:/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /^Unteraufgabe-Ausgabe lesen:/ })).toHaveProperty("disabled", false);
    rerender(<HermesV2WorkPanel chat={{ ...chat, work: base({ actions: [{ ...pending, status: "confirmed", result: { kind: "subagent.interrupt", id: "sa-1", found: false } }] }) }} />);
    expect(screen.getByRole("button", { name: /^Unteraufgabe unterbrechen:/ })).toHaveProperty("disabled", false);
    expect(screen.getByRole("log", { name: "Aufgabenaktionen" }).textContent).toContain("nicht mehr belegt");
  });

  it("nimmt den neuesten Tailread statt eines früheren Ergebnisses", () => {
    const old = tail("old", "confirmed", null);
    const chat = workChat(base({ actions: [old] }));
    const { rerender } = render(<HermesV2WorkPanel chat={chat} />);
    showPanel(); expandChild();
    rerender(<HermesV2WorkPanel chat={{ ...chat, work: base({ actions: [old, tail("new", "pending", null)] }) }} />);
    expect(screen.getByRole("button", { name: /^Unteraufgabe-Ausgabe lesen:/ })).toHaveProperty("disabled", true);
    rerender(<HermesV2WorkPanel chat={{ ...chat, work: base({ actions: [old, tail("new", "confirmed", "Neue eigene Ausgabe")] }) }} />);
    expect(screen.getByRole("button", { name: /^Unteraufgabe-Ausgabe lesen:/ })).toHaveProperty("disabled", false);
    expect(screen.getByRole("group", { name: /^Unteraufgabe-Ausgabe:/ }).textContent).toContain("Neue eigene Ausgabe");
  });

  it("entfernt nach neuem unavailable-Tail die alte aktuelle Ausgabekarte", () => {
    const old = tail("old", "confirmed", "Alte eigene Ausgabe");
    const chat = workChat(base({ actions: [old] }));
    const { rerender } = render(<HermesV2WorkPanel chat={chat} />);
    showPanel(); expandChild();
    expect(screen.getByRole("group", { name: /^Unteraufgabe-Ausgabe:/ })).toBeTruthy();
    rerender(<HermesV2WorkPanel chat={{ ...chat, work: base({ actions: [old, tail("new", "confirmed", null)] }) }} />);
    expect(screen.queryByRole("group", { name: /^Unteraufgabe-Ausgabe:/ })).toBeNull();
    expect(screen.getByRole("log", { name: "Aufgabenaktionen" }).textContent).toContain("keine Ausgabe");
  });

  it("führt Tail-HTML nicht aus und kennzeichnet gekürzte Ausgabe", () => {
    const html = '<img src=x onerror="window.__unsafeWork=1">';
    const entry = tail("own", "confirmed", html);
    if (entry.result?.kind === "subagent.tail") entry.result.truncated = true;
    const { container } = render(<HermesV2WorkPanel chat={workChat(base({ actions: [entry] }))} />);
    showPanel(); expandChild();
    expect(screen.getByRole("group", { name: /^Unteraufgabe-Ausgabe:/ }).textContent).toContain(html);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Die Ausgabe ist gekürzt.")).toBeTruthy();
  });

  it("wiederholt unknown-Aktionen nicht und erhält native Ablehnung im Aktionslog", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    render(<HermesV2WorkPanel chat={workChat(base({ actions: [
      actionView({ key: "u", action: "btw", status: "unknown", result: null,
        error: { code: "GATEWAY_OFFLINE", message: "Unklarer eigener Ausgang", outcome: "unknown" } }),
      actionView({ key: "s", action: "steer", result: { kind: "steer", status: "rejected" } }),
    ] }), { startBtw: start })} />);
    showPanel();
    const log = screen.getByRole("log", { name: "Aufgabenaktionen" });
    expect(log.textContent).toContain("Ausgang unklar");
    expect(log.textContent).toContain("abgelehnt");
    expect(start).not.toHaveBeenCalled();
  });

  it("unterscheidet unbekannten Queuekopf und an anderer Stelle gezeigten Kopf", () => {
    const chat = workChat(base({ queue: { head: null, observed: false } }));
    const { rerender } = render(<HermesV2WorkPanel chat={chat} />);
    showPanel();
    expect(screen.getByRole("status", { name: "Nächste eingereihte Nachricht" }).textContent).toContain("unbekannt");
    rerender(<HermesV2WorkPanel chat={{ ...chat, work: base({ queue: { head: "Tatsächlicher erster Kopf", observed: true } }) }} />);
    expect(screen.getByRole("status", { name: "Nächste eingereihte Nachricht" }).textContent).toContain("Tatsächlicher erster Kopf");
    rerender(<HermesV2WorkPanel chat={chat} queuedShown />);
    expect(screen.queryByRole("status", { name: "Nächste eingereihte Nachricht" })).toBeNull();
  });
});
