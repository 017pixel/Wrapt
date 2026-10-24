// Verhalten der Sitzungszeile: Zeit rechts in der Meta-Zeile, der Haken
// „Sitzung erledigen" als Zeilenaktion und das Menü des Projektfilters.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HermesV2SidebarPanel } from "./HermesV2Sidebar";
import { makeGroup, makeRow, makeSidebar } from "./sidebar-test-fixtures";

describe("HermesV2SidebarRow", () => {
  afterEach(cleanup);

  it("zeigt Modell, Projekt und relative Zeit erst in den Sitzungsdetails", () => {
    // Die Sidebar rechnet mit der vollen Minute; der Test nutzt denselben Wert,
    // damit die Angabe nicht an der Minutengrenze kippt.
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    const sidebar = makeSidebar({
      groups: [
        makeGroup("active", [
          makeRow({
            id: "a1",
            title: "Sitzung",
            cwd: "/home/bbecker",
            projectId: null,
            updatedAt: now - 3_600_000,
          }),
        ]),
      ],
    });
    const { container } = render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(container.querySelector(".hermesv2-rowtime")).toBeNull();
    expect(container.querySelector(".hermesv2-rowsource")).toBeNull();
    expect(container.textContent).not.toContain("prov");
    fireEvent.contextMenu(screen.getByRole("button", { name: "Sitzung" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sitzungsdetails" }));
    const preview = screen.getByRole("tooltip");
    expect(preview.textContent).toContain("prov · m");
    expect(preview.textContent).toContain("Ohne Projekt");
    expect(preview.textContent).not.toContain("bbecker");
    expect(preview.textContent).toContain("Zuletzt aktiv");
    expect(preview.textContent).not.toContain("Turn beendet");
  });

  it("verschiebt die Sitzung über den Haken in „Erledigt“", () => {
    const sidebar = makeSidebar({
      groups: [makeGroup("active", [makeRow({ id: "a1" })])],
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    const settle = screen.getByRole("button", { name: "Sitzung erledigen" });
    fireEvent.click(settle);
    expect(sidebar.calls.organize[0]).toMatchObject({
      sessionId: "a1",
      action: "settle",
      expectedRevision: 3,
    });
  });

  it("zeigt den Haken nur bei Sitzungen, die noch nicht erledigt sind", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("settled", [
          makeRow({ id: "f1", group: "settled", settledAt: 800_000 }),
        ]),
      ],
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Sitzung erledigen" }),
    ).toBeNull();
  });

  it("sperrt den Haken, solange die Sitzung gerade arbeitet", () => {
    const sidebar = makeSidebar({
      groups: [makeGroup("active", [makeRow({ id: "a1" })])],
      busySessionIds: ["a1"],
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    const settle = screen.getByRole("button", { name: "Sitzung erledigen" });
    expect(settle.hasAttribute("disabled")).toBe(true);
  });

  it("hat keinen Drei-Punkte-Knopf und keinen nativen Zeilen-Tooltip", () => {
    const sidebar = makeSidebar({
      groups: [makeGroup("active", [makeRow({ id: "a1" })])],
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    const menu = screen.getByRole("button", { name: "Aktionen für Erste Sitzung" });
    expect(menu.textContent).toBe("Aktionen");
    expect(document.querySelector(".hermesv2-rowmenu-button")).toBeNull();
    expect(document.querySelector(".hermesv2-rowselect")?.hasAttribute("title")).toBe(false);
  });
});

describe("HermesV2SidebarMenu", () => {
  afterEach(cleanup);

  it("zeigt im Projektfilter einen ruhigen Kopf und einen Haken an der Auswahl", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("active", [
          makeRow({ id: "a1", projectId: "p1", cwd: "/projekt/eins" }),
          makeRow({ id: "a2", projectId: "p2", cwd: "/projekt/zwei" }),
        ]),
      ],
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Projekt" }));
    const head = document.querySelector(".hermesv2-sidebar-menu-head");
    expect(head?.textContent).toContain("Projekt");
    // Die Auswahl ist mit einem Haken markiert.
    const selected = document.querySelector(
      '.hermesv2-sidebar-menu-entry[data-selected="true"]',
    );
    expect(selected?.textContent).toContain("Alle Projekte");
    expect(selected?.querySelector("svg")).toBeTruthy();
    expect(
      document.querySelectorAll('.hermesv2-sidebar-menu-entry[aria-checked="true"]'),
    ).toHaveLength(1);
  });

  it("bedient den Projektfilter mit der Tastatur", () => {
    const sidebar = makeSidebar({
      groups: [makeGroup("active", [makeRow({ id: "a1" })])],
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Projekt" });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const entries = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        ".hermesv2-sidebar-menu-entry",
      ),
    );
    expect(entries[0]).toBe(document.activeElement);
    fireEvent.keyDown(entries[0]!, { key: "ArrowDown" });
    expect(entries[1]).toBe(document.activeElement);
    fireEvent.keyDown(entries[1]!, { key: "Escape" });
    const panel = document.querySelector(".hermesv2-sidebar-menu-panel");
    expect(panel?.getAttribute("data-open")).toBe("false");
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
  });
});
