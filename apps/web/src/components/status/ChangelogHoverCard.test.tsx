// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangelogHoverCard } from "./ChangelogHoverCard";

afterEach(cleanup);

function renderCard(version: string | null = __WRAPT_APP_VERSION__) {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  render(
    <ChangelogHoverCard
      anchor={anchor}
      version={version}
      onPointerEnter={vi.fn()}
      onPointerLeave={vi.fn()}
      onBlur={vi.fn()}
    />,
  );
  return screen.getByTestId("changelog-card");
}

describe("ChangelogHoverCard", () => {
  it("zeigt den Changelog mit der laufenden Version", () => {
    const card = renderCard();
    expect(card.getAttribute("aria-label")).toBe("Changelog");
    expect(card.textContent).toContain("Changelog");
    expect(card.textContent).toContain(__WRAPT_APP_VERSION__);
  });

  it("rendert Stichpunkte mit Code-Stellen als Code-Element", () => {
    const card = renderCard();
    expect(card.querySelector("code")).not.toBeNull();
    expect(card.querySelectorAll(".chc-entry").length).toBeGreaterThan(0);
  });

  it("lässt Einträge neuer als die laufende Version aus", () => {
    const card = renderCard("0.1.0");
    expect(card.querySelectorAll(".chc-entry").length).toBe(0);
  });
});
