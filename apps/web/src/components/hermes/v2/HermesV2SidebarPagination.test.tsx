// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HermesV2SidebarPanel } from "./HermesV2Sidebar";
import { makeGroup, makeSidebar } from "./sidebar-test-fixtures";

describe("HermesV2SidebarPanel – Pagination", () => {
  afterEach(cleanup);

  it("Suche zeigt ehrliche Teilabdeckung und lädt ihre Folgeseiten bei der Liste", () => {
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
    // Die Folgeseiten kommen über den Knopf bei der Liste, zu der sie gehören.
    const knopf = container.querySelector(".hermesv2-shelf-more");
    expect(knopf).toBeTruthy();
    expect(knopf!.closest("[data-hermes-shelf='active']")).toBeTruthy();
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

  it("Katalog-Pagination ohne Suchtext lädt die Hauptliste, nicht je Nichtmitgliedergruppe", () => {
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
    // Nur die Hauptliste trägt den Nachladeknopf des Katalogs.
    const buttons = Array.from(document.querySelectorAll(".hermesv2-shelf-more"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.closest("[data-hermes-shelf='active']")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mehr laden" }));
    expect(sidebar.loadMore).toHaveBeenCalledTimes(1);
    expect(sidebar.calls.loadMembers).toEqual([]);
  });

  it("„Mehr laden“ steht nur bei der Liste und nur bei echter Fortsetzung", () => {
    const sidebar = makeSidebar({
      search: { hasMore: false, nextOffset: null, partial: false },
    });
    const { container } = render(
      <HermesV2SidebarPanel
        sidebar={sidebar}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Mehr laden" })).toBeNull();
    // Der globale Knopf über der Bereichsleiste ist entfallen.
    expect(container.querySelector(".hermesv2-sidebar-footer-actions")).toBeNull();

    const withMore = makeSidebar({
      search: { hasMore: true, nextOffset: 100, partial: false },
    });
    cleanup();
    const second = render(
      <HermesV2SidebarPanel
        sidebar={withMore}
        activeSessionId={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    );
    const button = second.container.querySelector(".hermesv2-shelf-more");
    expect(button).toBeTruthy();
    // Der Knopf steht bei der Hauptliste, zu der die Katalogseiten gehören.
    expect(button!.closest("[data-hermes-shelf='active']")).toBeTruthy();
    expect(container.querySelector(".hermesv2-shelf-more")).toBeNull();
  });
});
