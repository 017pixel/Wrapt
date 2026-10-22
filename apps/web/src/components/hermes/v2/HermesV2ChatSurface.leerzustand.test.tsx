// @vitest-environment jsdom
// Leerzustand und Sitzungsdetails der Chatfläche: ohne Projekt beginnen und
// die Details in der oberen rechten Ecke.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2ChatSurface } from "./HermesV2ChatSurface";
import { applyChatSnapshot, emptyChatSession } from "./chat-state";
import { snapshot as nativeSnapshot } from "./chat-test-fixtures";
import { requestChatFixture } from "./request-card-fixtures";
import type { HermesV2Chat } from "./chat-types";

/** Sitzung mit belegtem Arbeitsverzeichnis und belegter Quelle. */
function sessionView(): HermesV2Chat["activeSnapshot"] {
  const native = nativeSnapshot("s1");
  return applyChatSnapshot(emptyChatSession("s1"), {
    ...native,
    session: {
      ...native.session,
      cwd: "/eigene/projekte/a",
      source: "cli",
      projectId: null,
    },
  });
}

function chatWith(
  activeSnapshot: HermesV2Chat["activeSnapshot"],
): HermesV2Chat {
  return requestChatFixture({
    activeSnapshot,
    createSession: vi.fn().mockResolvedValue("neu"),
  });
}

function surface(chat: HermesV2Chat, onNewSession = vi.fn()) {
  return (
    <MemoryRouter>
      <HermesV2ChatSurface
        chat={chat}
        active
        variant="route"
        onNewSession={onNewSession}
      />
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("Leerzustand der Chatfläche", () => {
  it("startet auf Klick eine Sitzung ohne Projekt im laufenden Chat", () => {
    const chat = chatWith(null);
    const onNewSession = vi.fn();
    render(surface(chat, onNewSession));
    const start = screen.getByRole("button", {
      name: "oder ohne Projekt beginnen",
    });
    expect(start.hasAttribute("disabled")).toBe(false);
    fireEvent.click(start);
    expect(chat.createSession).toHaveBeenCalledTimes(1);
    expect(chat.createSession).toHaveBeenCalledWith({ projectId: null });
    // Kein Dialog und keine Navigation: der Dialog der Shell bleibt unberührt.
    expect(onNewSession).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Sitzungsdetails in der Ecke", () => {
  it("stehen oben rechts in der Chatfläche statt als Zeile über dem Verlauf", () => {
    const { container } = render(surface(chatWith(sessionView())));
    const corner = container.querySelector(".hermesv2-chat-corner");
    expect(corner?.querySelector("details")).toBeTruthy();
    expect(screen.getByText("Sitzungsdetails")).toBeTruthy();
    // Der Leerzustand bleibt frei: mit Sitzung gibt es keine Leerzeile.
    expect(
      screen.queryByRole("button", { name: "oder ohne Projekt beginnen" }),
    ).toBeNull();
  });

  it("weisen keine unbelegten Werte aus", () => {
    render(surface(chatWith(sessionView())));
    expect(screen.getByText("/eigene/projekte/a")).toBeTruthy();
    expect(screen.queryByText("Nicht gemeldet")).toBeNull();
    expect(screen.queryByRole("group", { name: "Projekt" })).toBeNull();
    // Die Quelle ist belegt und bleibt sichtbar.
    expect(screen.getByRole("group", { name: "Quelle" })).toBeTruthy();
  });
});
