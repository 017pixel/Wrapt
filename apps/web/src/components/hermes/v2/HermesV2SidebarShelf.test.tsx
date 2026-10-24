// Verhalten der Shelfs: Sichtbarkeit, Nachladen der geladenen Zeilen und das
// Umbenennen der aktiven Sitzung.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2SidebarPanel } from "./HermesV2Sidebar";
import {
  makeGroup,
  makeMetadata,
  makeRow,
  makeSidebar,
} from "./sidebar-test-fixtures";

describe("HermesV2SidebarShelf", () => {
  afterEach(cleanup);

  it("zeigt die ganze geladene Hauptliste für Scroll-Paginierung", () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      makeRow({ id: `r${index}`, title: `Zeile ${index}` }),
    );
    const sidebar = makeSidebar({ groups: [makeGroup("active", rows)] });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(screen.getByText("Zeile 4")).toBeTruthy();
    expect(screen.getByText("Zeile 5")).toBeTruthy();
    expect(screen.getByText("Zeile 6")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mehr anzeigen" })).toBeNull();
  });

  it("hält „Erledigt“ eingeklappt und klappt über die ganze Kopfzeile auf", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("settled", [
          makeRow({ id: "f1", title: "Fertig", group: "settled", settledAt: 800_000 }),
        ]),
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
    const head = container.querySelector(
      "[data-hermes-shelf='settled'] .hermesv2-shelf-collapse",
    )!;
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Fertig")).toBeNull();
    fireEvent.click(head);
    expect(sidebar.setCollapsed).toHaveBeenCalledWith("settled", false);
  });

  it("klappt den Inhalt über das Grid ein, ohne die Höhe zu messen", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("settled", [
          makeRow({ id: "f1", title: "Fertig", group: "settled", settledAt: 800_000 }),
        ]),
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
    const body = container.querySelector(
      "[data-hermes-shelf='settled'] .hermesv2-shelf-body",
    ) as HTMLElement;
    // Eingeklappt fährt die Grid-Zeile auf null, der Inhalt verschwindet.
    expect(body.getAttribute("data-collapsed")).toBe("true");
    // Die Höhe wird nicht gemessen und nicht gesetzt: das Grid übernimmt.
    expect(body.getAttribute("style")).toBeNull();
  });

  it("zeigt im Shelf „Erledigt“ fünf Zeilen und immer „Mehr laden“", () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      makeRow({
        id: `f${index}`,
        title: `Fertig ${index}`,
        group: "settled",
        settledAt: 800_000,
      }),
    );
    const sidebar = makeSidebar({
      groups: [makeGroup("settled", rows, { hasMore: false, complete: true })],
      collapsed: { settled: false },
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    // Die fünf sind eine Anzeigegrenze, keine Paginierung.
    expect(screen.getByText("Fertig 4")).toBeTruthy();
    expect(screen.queryByText("Fertig 5")).toBeNull();
    // "Mehr laden" steht beim Shelf, zu dem es gehört.
    fireEvent.click(screen.getByRole("button", { name: "Mehr laden" }));
    expect(sidebar.calls.loadMembers).toEqual(["settled"]);
  });

  it("bietet das Umbenennen nur in der Zeile der aktiven Sitzung an", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("active", [
          makeRow({ id: "a1", title: "Aktive Sitzung" }),
          makeRow({ id: "a2", title: "Andere Sitzung" }),
        ]),
      ],
    });
    const onRenameSession = vi.fn();
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId="a1"
        onSelect={() => undefined}
        onCreate={() => undefined}
        onRenameSession={onRenameSession}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Aktionen für Aktive Sitzung" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Sitzung umbenennen" }));
    expect(onRenameSession).toHaveBeenCalledWith("a1");
    fireEvent.click(
      screen.getByRole("button", { name: "Aktionen für Andere Sitzung" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: "Sitzung umbenennen" }),
    ).toBeNull();
  });

  it("bietet keinen Neu-laden-Knopf und keine globale Pin-Aktion an", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup(
          "pinned",
          [
            makeRow({
              id: "p1",
              group: "pinned",
              pinned: true,
              metadata: makeMetadata({ sessionId: "p1", pinRank: 0 }),
            }),
            makeRow({
              id: "p2",
              title: "Zweite",
              group: "pinned",
              pinned: true,
              metadata: makeMetadata({ sessionId: "p2", pinRank: 1 }),
            }),
          ],
          { hasMore: true, complete: false },
        ),
      ],
      pinMembershipComplete: false,
    });
    sidebar.planDrop = vi.fn(() => ({
      allowed: false as const,
      reason: "Die angeheftete Menge ist noch nicht vollständig geladen.",
    }));
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Neu laden" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Angeheftete vollständig laden" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Aktionen für Erste Sitzung" }),
    );
    const up = screen.getByRole("menuitem", { name: "Nach unten" });
    expect(up.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(up);
    expect(sidebar.calls.executeDrop).toEqual([]);
    expect(sidebar.calls.organize).toEqual([]);
    // Die Pin-Liste lädt der Shelf selbst nach; die globale Aktion entfällt.
    fireEvent.click(
      screen.getByRole("button", { name: "Mehr Angeheftete laden" }),
    );
    expect(sidebar.preparePinnedReorder).toHaveBeenCalledTimes(1);
  });

  it("blendet einen leeren Shelf aus und zeigt ihn wieder, sobald Zeilen kommen", () => {
    const ohneZeilen = makeSidebar({
      groups: [
        makeGroup("active", [makeRow({ id: "a1" })]),
        makeGroup("needs-input", []),
      ],
    });
    const { container, rerender } = render(
      <HermesV2SidebarPanel
        sidebar={ohneZeilen}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    const shelf = container.querySelector("[data-hermes-shelf='needs-input']");
    expect(shelf?.getAttribute("data-empty")).toBe("true");
    // Sobald eine Zeile eintrifft, steht der Shelf wieder.
    rerender(
      <HermesV2SidebarPanel
        sidebar={makeSidebar({
          groups: [
            makeGroup("active", [makeRow({ id: "a1" })]),
            makeGroup("needs-input", [
              makeRow({ id: "n1", group: "needs-input", title: "Frage" }),
            ]),
          ],
        })}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(
      container
        .querySelector("[data-hermes-shelf='needs-input']")
        ?.getAttribute("data-empty"),
    ).toBeNull();
  });

  it("zeigt den Ladehinweis nur beim ersten Laden, nicht bei der Aktualisierung", () => {
    // Hintergrundaktualisierung: die Zeilen bleiben, der Hinweis entfällt.
    const aktualisierung = makeSidebar({
      groups: [
        makeGroup("settled", [
          makeRow({ id: "f1", group: "settled", title: "Fertig" }),
        ], { loading: true }),
      ],
    });
    const { container, rerender } = render(
      <HermesV2SidebarPanel
        sidebar={aktualisierung}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(screen.queryByText("Lädt…")).toBeNull();
    // Erstes Laden einer Mitgliederliste: der Hinweis steht beim Shelf.
    rerender(
      <HermesV2SidebarPanel
        sidebar={makeSidebar({
          groups: [
            makeGroup("settled", [], { loading: true, hasMore: true, complete: false }),
          ],
        })}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(screen.getByText("Lädt…")).toBeTruthy();
    // Ein leerer Shelf bleibt verborgen, auch solange er lädt.
    rerender(
      <HermesV2SidebarPanel
        sidebar={makeSidebar({
          groups: [
            makeGroup("active", [makeRow({ id: "a1" })]),
            makeGroup("needs-input", [], { loading: true }),
          ],
        })}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(screen.queryByText("Lädt…")).toBeNull();
    expect(
      container
        .querySelector("[data-hermes-shelf='needs-input']")
        ?.getAttribute("data-empty"),
    ).toBe("true");
  });

});
