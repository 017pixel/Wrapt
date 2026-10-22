// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2SessionContext } from "./HermesV2SessionContext";
import { HermesV2ChatSurface } from "./HermesV2ChatSurface";
import { applyChatSnapshot, emptyChatSession } from "./chat-state";
import { snapshot } from "./chat-test-fixtures";
import { requestChatFixture } from "./request-card-fixtures";
import type { ChatSessionView } from "./chat-types";

function view(id = "a", fields = { cwd: "/eigene/projekte/a", projectId: "project-a" as string | null, source: "cli" }) {
  const native = snapshot(id);
  return applyChatSnapshot(emptyChatSession(id), { ...native, session: { ...native.session, ...fields } });
}
afterEach(cleanup);

describe("Tatsächlich gemeldeter Sitzungskontext", () => {
  it("zeigt CWD, rohe Projektkennung und Quelle in einer beschrifteten Region", () => {
    render(<HermesV2SessionContext snapshot={view()} />);
    const region = screen.getByRole("region", { name: "Sitzungskontext" });
    expect(within(region).getAllByRole("group")).toHaveLength(3);
    expect(within(region).getByText("/eigene/projekte/a").tagName).toBe("DD");
    expect(within(region).getByText("project-a").tagName).toBe("DD");
    expect(within(region).getByText("cli").tagName).toBe("DD");
    for (const label of ["Arbeitsverzeichnis", "Projekt", "Quelle"]) {
      const field = within(region).getByRole("group", { name: label });
      expect(field.tabIndex).toBe(0);
      field.focus();
      expect(document.activeElement).toBe(field);
    }
  });

  it("zeigt das beobachtete Modell, sobald die Sitzung eines meldet", () => {
    const native = view();
    render(
      <HermesV2SessionContext
        snapshot={{ ...native, selection: { model: "minimax-m3" } }}
      />,
    );
    const region = screen.getByRole("region", { name: "Sitzungskontext" });
    expect(
      within(region).getByRole("group", { name: "Modell" }).querySelector("dd")?.textContent,
    ).toBe("minimax-m3");
  });

  it("zeigt ohne gemeldetes Modell kein Modellfeld", () => {
    render(<HermesV2SessionContext snapshot={view()} />);
    const region = screen.getByRole("region", { name: "Sitzungskontext" });
    expect(within(region).queryByRole("group", { name: "Modell" })).toBeNull();
  });

  it("erhält vollständige lange Werte und unbekannte Quellen ohne Ableitung oder Kürzung", () => {
    const cwd = "/" + "native-path/".repeat(341).slice(0, 4_095);
    const projectId = "p".repeat(200);
    const source = "vendor_" + "x".repeat(93);
    render(<HermesV2SessionContext snapshot={view("a", { cwd, projectId, source })} />);
    for (const value of [cwd, projectId, source]) {
      const text = screen.getByText(value);
      expect(text.textContent).toBe(value);
      expect(text.parentElement?.title).toBe(value);
    }
  });

  it("zeigt fehlende Werte nicht an und errät kein Projekt aus dem Pfad", () => {
    const native = view("a", { cwd: "/projekte/vermeintliches-projekt", projectId: null, source: "" });
    render(<HermesV2SessionContext snapshot={native} />);
    const region = screen.getByRole("region", { name: "Sitzungskontext" });
    expect(within(region).getAllByRole("group")).toHaveLength(1);
    expect(within(region).getByRole("group", { name: "Arbeitsverzeichnis" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Projekt" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Quelle" })).toBeNull();
    expect(screen.queryByText("Nicht gemeldet")).toBeNull();
    expect(screen.queryByText("vermeintliches-projekt", { exact: true })).toBeNull();
  });

  it("erhält auch Leerzeichen und Zeilenumbrüche in tatsächlich gemeldeten Werten", () => {
    const cwd = "/eigene/mit  zwei Leerzeichen/und\nZeilenumbruch";
    const source = " vendor  source ";
    render(<HermesV2SessionContext snapshot={view("a", { cwd, projectId: null, source })} />);
    expect(screen.getByRole("group", { name: "Arbeitsverzeichnis" }).querySelector("dd")?.textContent).toBe(cwd);
    expect(screen.getByRole("group", { name: "Quelle" }).querySelector("dd")?.textContent).toBe(source);
  });

  it("behält keinen alten Kontext bei Sessionwechsel, fehlender Projektion oder leerer Auswahl", () => {
    const { rerender } = render(<HermesV2SessionContext snapshot={view()} />);
    rerender(<HermesV2SessionContext snapshot={view("b", { cwd: "/zweiter/kontext", projectId: "project-b", source: "telegram" })} />);
    expect(screen.queryByText("/eigene/projekte/a")).toBeNull();
    expect(screen.getByText("/zweiter/kontext")).toBeTruthy();
    expect(screen.getByText("project-b")).toBeTruthy();
    expect(screen.getByText("telegram")).toBeTruthy();
    rerender(<HermesV2SessionContext snapshot={{ sessionId: "c", session: null }} />);
    expect(screen.queryByRole("region", { name: "Sitzungskontext" })).toBeNull();
    expect(screen.queryByText("/zweiter/kontext")).toBeNull();
    rerender(<HermesV2SessionContext snapshot={null} />);
    expect(screen.queryByRole("region", { name: "Sitzungskontext" })).toBeNull();
  });

  it("verwirft eine nicht zur gewählten ID passende alte Sessionprojektion", () => {
    render(<HermesV2SessionContext snapshot={{ sessionId: "b", session: view().session }} />);
    expect(screen.queryByRole("region", { name: "Sitzungskontext" })).toBeNull();
    expect(screen.queryByText("/eigene/projekte/a")).toBeNull();
    expect(screen.queryByText("project-a")).toBeNull();
    expect(screen.queryByText("cli")).toBeNull();
  });

  it("ersetzt aktualisierte native Angaben derselben Sitzung und räumt leere Werte auf", () => {
    const { rerender } = render(<HermesV2SessionContext snapshot={view()} />);
    const updated = view();
    updated.session = { ...updated.session!, cwd: null, projectId: null, source: "   " };
    rerender(<HermesV2SessionContext snapshot={updated} />);
    expect(screen.queryByRole("region", { name: "Sitzungskontext" })).toBeNull();
    expect(screen.queryByText("/eigene/projekte/a")).toBeNull();
  });
});

describe("Kontext in der tatsächlichen Chatfläche", () => {
  it.each(["route", "standalone", "panel", "orbit"] as const)("rendert in %s ohne zusätzliche Aktionen und entfernt alte Auswahl", (variant) => {
    const chat = requestChatFixture({ activeSnapshot: view() });
    const read = vi.spyOn(chat, "readCatalog");
    const create = vi.spyOn(chat, "createSession");
    const submit = vi.spyOn(chat, "submit");
    const surface = (activeSnapshot: ChatSessionView | null) => <MemoryRouter>
      <HermesV2ChatSurface chat={{ ...chat, activeSnapshot }} variant={variant} active onNewSession={() => undefined} />
    </MemoryRouter>;
    const { rerender } = render(surface(chat.activeSnapshot));
    expect(screen.getByRole("region", { name: "Sitzungskontext" })).toBeTruthy();
    expect(screen.getByText("/eigene/projekte/a")).toBeTruthy();
    rerender(surface(view("b", { cwd: "/aktuell/b", projectId: "b", source: "web" })));
    expect(screen.queryByText("/eigene/projekte/a")).toBeNull();
    expect(screen.getByText("/aktuell/b")).toBeTruthy();
    rerender(surface(null));
    expect(screen.queryByRole("region", { name: "Sitzungskontext" })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
