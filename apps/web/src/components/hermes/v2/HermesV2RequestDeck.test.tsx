// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2RequestDeck } from "./HermesV2RequestDeck";
import type {
  ChatRequestState,
  ChatSessionView,
  HermesV2Chat,
  HermesV2Response,
} from "./chat-types";
import {
  approvalRequest,
  clarifyRequest,
  requestChatFixture,
  secretRequest,
  setupRequest,
} from "./request-card-fixtures";

function snapshotView(
  overrides: Partial<ChatSessionView> = {},
): ChatSessionView {
  return {
    sessionId: "s1",
    session: null,
    epoch: "e1",
    cursor: 0,
    generation: 1,
    loading: false,
    error: null,
    messages: [],
    tools: [],
    requests: [],
    running: false,
    turnStartedAt: null,
    writable: true,
    blockedReason: null,
    queuedText: null,
    selection: null,
    reasoningEffort: null,
    usage: null,
    subagents: [],
    background: [],
    hasOlder: false,
    loadingOlder: false,
    generatingTool: null,
    catalog: { commands: [], models: null, loading: false, error: null },
    ...overrides,
  };
}

function renderDeck(
  chat: HermesV2Chat,
  requests: ChatSessionView["requests"],
  interactive = true,
) {
  return render(
    <MemoryRouter>
      <HermesV2RequestDeck
        chat={chat}
        snapshot={snapshotView({ requests })}
        interactive={interactive}
      />
    </MemoryRouter>,
  );
}

describe("RequestDeck", () => {
  afterEach(cleanup);

  it("ohne offene Requests bleibt das Deck vollständig unsichtbar", () => {
    const chat = requestChatFixture();
    const { container } = renderDeck(chat, []);
    expect(container.innerHTML).toBe("");
  });

  it("ordnet klar nach createdAt, dann key und trägt den opaque Key und Kind an der Kartenwurzel", () => {
    const earlyFirst = approvalRequest({
      createdAt: 10,
      key: "11111111-1111-4111-8111-111111111111",
    });
    const earlySecond = clarifyRequest({
      createdAt: 10,
      key: "33333333-3333-4333-8333-333333333333",
    });
    const later = setupRequest({
      createdAt: 20,
      key: "22222222-2222-4222-8222-222222222222",
    });
    const chat = requestChatFixture();
    const { container } = renderDeck(chat, [later, earlySecond, earlyFirst]);
    const roots = Array.from(
      container.querySelectorAll("[data-hermes-request-key]"),
    );
    expect(roots).toHaveLength(3);
    expect(roots[0]?.getAttribute("data-request-kind")).toBe("approval");
    expect(roots[1]?.getAttribute("data-request-kind")).toBe("clarify");
    expect(roots[2]?.getAttribute("data-request-kind")).toBe("setup");
  });

  it("offene Anfragen halten den ergänzenden Classic-Einstieg", () => {
    renderDeck(requestChatFixture(), [approvalRequest()]);
    const classic = screen.getByRole("link", {
      name: "Klassische Hermes-Oberfläche öffnen",
    });
    expect(classic).toBeTruthy();
  });

  it("unbekannter Ausgang sperrt genau die betroffene Karte, bietet Abgleich und Classic", () => {
    const states: ChatRequestState[] = [
      { key: approvalRequest().key, epoch: "e1", status: "unknown" },
    ];
    const chat = requestChatFixture({ requestStates: states });
    const resync = vi.fn();
    chat.resync = resync;
    const blocked = approvalRequest();
    const open = setupRequest({
      key: "22222222-2222-4222-8222-222222222222",
      createdAt: 50,
    });
    renderDeck(chat, [blocked, open]);
    expect(
      screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Abbrechen" })
        .hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Abgleichen" }));
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("verlorene Verbindung sperrt alle Karten mit ruhigem Status und klassischem Einstieg", () => {
    const chat = requestChatFixture();
    chat.connection = { state: "offline", attempt: 2, error: null };
    renderDeck(chat, [approvalRequest()]);
    expect(screen.getByText("Keine Verbindung zu Hermes.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("fremde Fläche sperrt, aktive Fläche lässt Card-Aktionen zu", () => {
    const chat = requestChatFixture();
    const { rerender } = renderDeck(chat, [approvalRequest()], false);
    expect(
      screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled"),
    ).toBe(true);
    rerender(
      <MemoryRouter>
        <HermesV2RequestDeck
          chat={chat}
          snapshot={snapshotView({ requests: [approvalRequest()] })}
          interactive
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("synchroner Doppelklick sendet nur eine Antwort", () => {
    const sends: HermesV2Response[] = [];
    const chat = requestChatFixture();
    chat.respond = () => new Promise<void>(() => undefined); // Senden läuft laufend
    const respondSpy = vi.spyOn(chat, "respond");
    respondSpy.mockImplementation((_request, response) => {
      sends.push(response);
      return new Promise(() => undefined);
    });
    renderDeck(chat, [approvalRequest()]);
    const deny = screen.getByRole("button", { name: "Ablehnen" });
    deny.click();
    deny.click(); // gleicher Tick: Sperre verhindert den parallelen Sendversuch
    expect(sends).toEqual([{ kind: "approval", choice: "deny" }]);
  });

  it("Secretkarte im Deck sendet über das Standardformular", () => {
    const chat = requestChatFixture();
    renderDeck(chat, [secretRequest()]);
    expect(document.querySelectorAll("input[type='password']").length).toBe(1);
    expect(document.querySelector("button[type='submit']")?.textContent).toBe(
      "Senden",
    );
  });

  it("lokaler Status gilt nur für die passende Epoche derselben Anfrage", () => {
    const chat = requestChatFixture({
      requestStates: [
        { key: approvalRequest().key, epoch: "e1", status: "pending" },
      ],
    });
    const { rerender } = renderDeck(chat, [approvalRequest({ epoch: "e2" })]);
    expect(
      screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled"),
    ).toBe(false);
    rerender(
      <MemoryRouter>
        <HermesV2RequestDeck
          chat={chat}
          snapshot={snapshotView({ requests: [approvalRequest()] })}
          interactive
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
