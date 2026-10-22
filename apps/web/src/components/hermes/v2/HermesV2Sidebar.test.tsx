// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2SidebarPanel } from "./HermesV2Sidebar";
import {
  makeGroup,
  makeRow,
  makeSidebar,
} from "./sidebar-test-fixtures";

describe("HermesV2SidebarPanel", () => {
  afterEach(cleanup);

  it("hängt aria-controls nur an erreichbare Gruppenlisten", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup(
          "settled",
          [
            makeRow({ id: "f1", group: "settled", settledAt: 800_000 }),
          ],
        ),
        makeGroup(
          "working",
          [makeRow({ id: "w1", title: "Läuft", group: "working" })],
        ),
      ],
      collapsed: { settled: true },
    });
    const { container } = render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    // Eingeklappt ohne sichtbare Row: kein verweisender Erreichbarkeitslink.
    const collapsed = container.querySelector(
      "[data-hermes-shelf='settled'] .hermesv2-shelf-collapse",
    );
    expect(collapsed).toBeTruthy();
    expect(collapsed!.getAttribute("aria-expanded")).toBe("false");
    expect(collapsed!.getAttribute("aria-controls")).toBeNull();
    // Ausgeklappt: der Link zeigt auf eine tatsächlich gelistete Gruppe.
    const expanded = container.querySelector(
      "[data-hermes-shelf='working'] .hermesv2-shelf-collapse",
    );
    expect(expanded).toBeTruthy();
    const targetId = expanded!.getAttribute("aria-controls");
    expect(targetId).toBeTruthy();
    expect(document.getElementById(targetId!)).toBeTruthy();
  });

  it("zeigt Eingabe nötig vor der Hauptliste und die übrigen Shelfs unten", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("pinned", [
          makeRow({ id: "p1", title: "Pin", group: "pinned", pinned: true }),
        ]),
        makeGroup("needs-input", [
          makeRow({
            id: "n1",
            title: "Frage",
            group: "needs-input",
            attentionKind: "request",
            unreadCount: 1,
          }),
        ]),
        makeGroup("active", [makeRow({ id: "a1", title: "Ruhig" })]),
        makeGroup("working", [
          makeRow({
            id: "w1",
            title: "Läuft",
            group: "working",
            activity: "working",
            durationMs: 90_000,
          }),
        ]),
        makeGroup("snoozed", [], { count: 2, hasMore: true, complete: false }),
        makeGroup("settled", [
          makeRow({
            id: "f1",
            title: "Fertig",
            group: "settled",
            settledAt: 800_000,
          }),
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
    const order = Array.from(
      document.querySelectorAll("[data-hermes-shelf]"),
    ).map((section) => section.getAttribute("data-hermes-shelf"));
    // Eingabe nötig steht oben, "Erledigt" steht ganz unten.
    expect(order).toEqual([
      "needs-input",
      "active",
      "working",
      "pinned",
      "snoozed",
      "settled",
    ]);
    // Shelf-Label mit Zähler, wie im T3-Vorbild. Die Hauptliste hat keinen Namen.
    const headings = Array.from(
      document.querySelectorAll(".hermesv2-shelf-title"),
    ).map((heading) => heading.textContent?.trim());
    expect(headings).toEqual(
      expect.arrayContaining([
        "Eingabe nötig (1)",
        "Angeheftet (1)",
        "In Arbeit (1)",
        "Zurückgestellt (2)",
        "Erledigt (1)",
      ]),
    );
    expect(headings).toHaveLength(5);
    expect(screen.queryByText("Aktiv")).toBeNull();
    // Nur der aktive Shelf trägt die Akzentfarbe.
    const accent = document.querySelector(
      ".hermesv2-shelf-title[data-accent='true']",
    );
    expect(accent?.closest("[data-hermes-shelf]")?.getAttribute("data-hermes-shelf")).toBe(
      "needs-input",
    );
    // Ehrliche Statuswörter nur dort, wo sie mehr sagen als die Shelf-Bezeichnung.
    expect(screen.getByText(/Wartet auf dich/)).toBeTruthy();
    expect(document.querySelector(".hermesv2-shelves [data-hermes-shelf='needs-input']")).toBeTruthy();
    expect(screen.queryByText(/\d+ neu/)).toBeNull();
    expect(screen.queryByText(/Arbeitet/)).toBeNull();
  });

  it("hängt die Shelfs unten an und lässt die Hauptliste oben scrollen", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("active", [makeRow({ id: "a1", title: "Ruhig" })]),
        makeGroup("working", [
          makeRow({ id: "w1", title: "Läuft", group: "working" }),
        ]),
        makeGroup("settled", [
          makeRow({ id: "f1", title: "Fertig", group: "settled" }),
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
    const liste = container.querySelector(".hermesv2-shelves");
    const dock = container.querySelector(".hermesv2-shelf-dock");
    expect(liste).toBeTruthy();
    expect(dock).toBeTruthy();
    // Die Hauptliste steht oben, die Shelfs hängen darunter an.
    expect(liste!.querySelector("[data-hermes-shelf='active']")).toBeTruthy();
    expect(liste!.querySelector("[data-hermes-shelf='settled']")).toBeNull();
    expect(dock!.querySelector("[data-hermes-shelf='working']")).toBeTruthy();
    expect(dock!.querySelector("[data-hermes-shelf='settled']")).toBeTruthy();
    expect(liste!.nextElementSibling).toBe(dock);
  });

  it("Pin bleibt sichtbarer Modifikator in Needs input und bietet Lösen an", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("needs-input", [
          makeRow({
            id: "n1",
            group: "needs-input",
            pinned: true,
            attentionKind: "new-answer",
            unreadCount: 2,
          }),
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
    expect(screen.getByLabelText("Angeheftet")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Aktionen für Erste Sitzung" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Lösen" }));
    expect(sidebar.calls.organize[0]).toMatchObject({
      sessionId: "n1",
      action: "unpin",
      expectedRevision: 3,
    });
  });

  it("sperrt Aktionen synchron bei laufender Aktion derselben Sitzung", () => {
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
    const menu = screen.getByRole("button", {
      name: "Aktionen für Erste Sitzung",
    });
    expect(menu.hasAttribute("disabled")).toBe(true);
  });

  it("Collapse bleibt versioniert beim Hook und hält die aktive Row erreichbar", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup(
          "settled",
          [
            makeRow({ id: "f1", group: "settled", settledAt: 800_000 }),
            makeRow({
              id: "a1",
              group: "settled",
              title: "Aktiv drin",
              settledAt: 800_000,
            }),
          ],
          { collapsed: true },
        ),
      ],
      collapsed: { settled: true },
    });
    const { container } = render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId="a1"
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(sidebar.setCollapsed).not.toHaveBeenCalled();
    // Nur die ausgewählte Row bleibt sichtbar, keine doppelte Anzeige.
    expect(screen.getByText("Aktiv drin")).toBeTruthy();
    expect(screen.queryByText("Erste Sitzung")).toBeNull();
    fireEvent.click(
      container.querySelector(
        "[data-hermes-shelf='settled'] .hermesv2-shelf-collapse",
      )!,
    );
    expect(sidebar.setCollapsed).toHaveBeenCalledWith("settled", false);
  });

  it("zeigt für Organisationsänderungen keinen Rückgängig-Hinweis", () => {
    const sidebar = makeSidebar({
      undoView: {
        handle: "h1",
        expiresAt: 4_000_000_000_000,
        remainingMs: 9_000,
      },
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Rückgängig" })).toBeNull();
    expect(screen.queryByText("Organisation geändert")).toBeNull();
  });

  it("Viewmodel-Fehler werden als Alert gezeigt und lassen sich schließen", () => {
    const sidebar = makeSidebar({
      error: {
        code: "ORGANIZATION_CONFLICT",
        message: "Der Stand hat sich geändert. Bitte erneut versuchen.",
        outcome: "unknown",
      },
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(sidebar.clearError).toHaveBeenCalled();
  });

  it("Zurückstellen öffnet das Sheet und übergibt Sitzung und Revision", () => {
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
    fireEvent.click(
      screen.getByRole("button", { name: "Aktionen für Erste Sitzung" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Zurückstellen" }));
    expect(
      screen.getByRole("dialog", { name: "Sitzung zurückstellen" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zurückstellen" }));
    expect(sidebar.calls.snooze[0]).toEqual([
      "a1",
      3,
      { timeZone: expect.any(String), preset: "30m" },
    ]);
  });

  it("Droppläne laufen über planDrop/executeDrop ohne eigene Mutation", () => {
    const plan = {
      allowed: true as const,
      kind: "action" as const,
      command: {
        sessionId: "a1",
        expectedRevision: 3,
        action: "settle" as const,
      },
    };
    const sidebar = makeSidebar({
      groups: [
        makeGroup("active", [makeRow({ id: "a1" })]),
        makeGroup("settled", []),
      ],
    });
    sidebar.planDrop = vi.fn(() => plan);
    const { container } = render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    const row = container.querySelector(".hermesv2-rowitem") as HTMLElement;
    fireEvent.dragStart(row, {
      dataTransfer: { setData: () => undefined, effectAllowed: undefined },
    });
    const shelf = container.querySelector(
      "[data-hermes-shelf='settled']",
    ) as HTMLElement;
    fireEvent.dragOver(shelf, { dataTransfer: { dropEffect: "" } });
    expect(shelf.getAttribute("data-drop-active")).toBe("true");
    fireEvent.drop(shelf, { dataTransfer: { dropEffect: "" } });
    expect(sidebar.calls.executeDrop).toEqual([plan]);
  });
});
