// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HermesV2SidebarPanel } from "./HermesV2Sidebar";
import { makeGroup, makeSidebar } from "./sidebar-test-fixtures";

describe("HermesV2SidebarPanel – Pagination", () => {
  afterEach(cleanup);

  it("Suche zeigt ehrliche Teilabdeckung und lädt weitere Treffer ausdrücklich", () => {
    const sidebar = makeSidebar({
      search: {
        query: "api",
        loading: false,
        hasMore: true,
        nextOffset: 100,
        loadedCount: 100,
        partial: true,
        limitReached: false,
      },
    });
    const { container } = render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(screen.getByText(/ deckt nur geladene Seiten ab/)).toBeTruthy();
    // Nur die Suche bietet einen ausdrücklichen Nachladeknopf; die normale
    // Hauptliste lädt unsichtbar beim Scrollen nach.
    const knopf = container.querySelector(".hermesv2-shelf-more");
    expect(knopf?.textContent).toBe("Weitere Treffer laden");
    fireEvent.click(knopf!);
    expect(sidebar.loadMore).toHaveBeenCalledTimes(1);
  });

  it("Mitgliedgruppen laden ihre nächste Seite über loadMembers", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("snoozed", [], {
          count: 100,
          hasMore: true,
          complete: false,
        }),
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
    fireEvent.click(
      screen.getByRole("button", { name: "Mehr Zurückgestellte laden" }),
    );
    expect(sidebar.calls.loadMembers).toEqual(["snoozed"]);
  });

  it("Katalogseiten erscheinen ohne Nachladeknopf in der Hauptliste", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("working", [], { count: 20, hasMore: true, complete: false }),
        makeGroup("active", [], { count: 100, hasMore: true, complete: false }),
      ],
      search: { hasMore: true, nextOffset: 100, partial: false },
    });
    render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    // Die Hauptliste lädt nicht mehr über einen sichtbaren Knopf nach.
    expect(document.querySelector(".hermesv2-shelf-more")).toBeNull();
    expect(sidebar.loadMore).not.toHaveBeenCalled();
    expect(sidebar.calls.loadMembers).toEqual([]);
  });

  it("lädt die normale Hauptliste unsichtbar beim Scrollen ans Ende nach", () => {
    const sidebar = makeSidebar({
      search: { hasMore: true, nextOffset: 100, partial: false },
    });
    const { container } = render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(container.querySelector(".hermesv2-shelf-more")).toBeNull();
    const shelves = container.querySelector(".hermesv2-shelves") as HTMLElement;
    Object.defineProperty(shelves, "scrollHeight", { configurable: true, value: 1_000 });
    Object.defineProperty(shelves, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(shelves, "scrollTop", { configurable: true, value: 600 });
    fireEvent.scroll(shelves);
    expect(sidebar.loadMore).toHaveBeenCalledTimes(1);
  });

  it("„Mehr laden“ bleibt bei Mitgliedergruppen mit echter Fortsetzung", () => {
    const sidebar = makeSidebar({
      groups: [
        makeGroup("settled", [], {
          count: 100,
          hasMore: true,
          complete: false,
        }),
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
    // Der globale Knopf über der Bereichsleiste ist entfallen.
    expect(container.querySelector(".hermesv2-sidebar-footer-actions")).toBeNull();

    const button = container.querySelector(".hermesv2-shelf-more");
    expect(button).toBeTruthy();
    expect(button!.closest("[data-hermes-shelf='settled']")).toBeTruthy();
  });
});
