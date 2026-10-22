// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { undoOrganization } from "./undo-shortcut";
import { makeGroup, makeRow, makeSidebar } from "./sidebar-test-fixtures";
import { HermesV2SidebarPanel } from "./HermesV2Sidebar";

afterEach(cleanup);

function setup(remainingMs = 9_000, busySessionIds: string[] = []) {
  const sidebar = makeSidebar({
    undoView: { handle: "h1", expiresAt: 4_000_000_000_000, remainingMs }, busySessionIds,
  });
  const view = render(
    <section onKeyDown={(event) => undoOrganization(event, sidebar)}>
      <button>Chat</button>
      <input aria-label="Suche" />
      <textarea aria-label="Nachricht" />
      <div contentEditable role="textbox" aria-label="Editor" />
    </section>,
  );
  return { sidebar, ...view };
}

describe("Organisationsänderungen per Strg+Z", () => {
  it("erhält Strg+Z, wenn beim Erledigen der fokussierte Zeilenknopf verschwindet", () => {
    const sidebar = makeSidebar({ groups: [makeGroup("active", [makeRow()])] });
    const tree = () => <section onKeyDown={(event) => undoOrganization(event, sidebar)}>
      <HermesV2SidebarPanel sidebar={sidebar} activeSessionId={null} onSelect={() => undefined} onCreate={() => undefined} />
    </section>;
    const { container, rerender } = render(tree());
    screen.getByRole("button", { name: "Erste Sitzung" }).focus();
    sidebar.groups = [makeGroup("settled", [makeRow({ group: "settled" })])];
    sidebar.collapsed = { ...sidebar.collapsed, settled: true };
    sidebar.undoView = { handle: "h1", expiresAt: 4_000_000_000_000, remainingMs: 9_000 };
    rerender(tree());
    expect(document.activeElement).toBe(container.querySelector(".hermesv2-sessionpanel"));
    fireEvent.keyDown(document.activeElement!, { key: "z", ctrlKey: true });
    expect(sidebar.calls.undo).toBe(1);
  });

  it("unterstützt Strg+Z und Cmd+Z innerhalb der Hermes-Fläche", () => {
    const { sidebar } = setup();
    const button = screen.getByRole("button");
    expect(fireEvent.keyDown(button, { key: "z", ctrlKey: true })).toBe(false);
    expect(sidebar.calls.undo).toBe(1);
    fireEvent.keyDown(button, { key: "z", metaKey: true });
    expect(sidebar.calls.undo).toBe(2);
  });

  it("behält natives Undo für Suchfeld, Composer und Texteditor", () => {
    const { sidebar } = setup();
    for (const name of ["Suche", "Nachricht", "Editor"]) {
      expect(fireEvent.keyDown(screen.getByLabelText(name), { key: "z", ctrlKey: true })).toBe(true);
    }
    expect(sidebar.calls.undo).toBe(0);
  });

  it("ignoriert Redo, Alt, IME und Wiederholung einer gehaltenen Taste", () => {
    const { sidebar } = setup();
    for (const extra of [{ shiftKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }]) {
      fireEvent.keyDown(screen.getByRole("button"), { key: "z", ctrlKey: true, ...extra });
    }
    expect(sidebar.calls.undo).toBe(0);
  });

  it("fasst andere Flächen und abgelaufene Änderungen nicht an", () => {
    const { sidebar } = setup(0);
    fireEvent.keyDown(screen.getByRole("button"), { key: "z", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(sidebar.calls.undo).toBe(0);
  });

  it("wartet bei einer laufenden Organisationsänderung", () => {
    const { sidebar } = setup(9_000, ["s1"]);
    fireEvent.keyDown(screen.getByRole("button"), { key: "z", ctrlKey: true });
    expect(sidebar.calls.undo).toBe(0);
  });
});
