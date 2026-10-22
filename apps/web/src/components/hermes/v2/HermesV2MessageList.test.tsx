// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { marked } from "marked";
import { MemoryRouter } from "react-router";
import type { ChatMessageView, ChatSessionView } from "./chat-types";
import { HermesV2MessageList } from "./HermesV2MessageList";
import { HermesV2RequestDeck } from "./HermesV2RequestDeck";
import { requestChatFixture } from "./request-card-fixtures";

function message(overrides: Partial<ChatMessageView>): ChatMessageView {
  return {
    id: "m1",
    rowId: 1,
    logicalId: null,
    role: "user",
    text: "Eigener Prompt",
    reasoning: null,
    timestamp: 1_800_000_000_000,
    status: "complete",
    error: null,
    tools: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<ChatSessionView>): ChatSessionView {
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

describe("HermesV2MessageList", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("zeigt chronologische Rollen, Zeit und Fehler ehrlich", () => {
    const { container } = render(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [
            message({}),
            message({
              id: "m2",
              role: "assistant",
              text: "Antwort mit **Fett**",
              error: "Verbindung unterbrochen",
            }),
            message({ id: "m3", role: "tool", text: "Terminalausgabe" }),
          ],
        })}
      />,
    );
    expect(container.textContent).toContain("Eigener Prompt");
    expect(container.querySelector("strong")?.textContent).toBe("Fett");
    expect(container.textContent).toContain("Verbindung unterbrochen");
    expect(container.textContent).toContain("Terminalausgabe");
  });

  it("zeigt eingereihte Arbeit getrennt vom Verlauf", () => {
    const { container } = render(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({ queuedText: "Eingereihte Nachricht" })}
      />,
    );
    expect(
      container.querySelector("[class*='is-queued']")?.textContent,
    ).toContain("Eingereihte Nachricht");
  });

  it("zeigt beim initialen Abgleich einen Ladehinweis statt eines leeren Verlaufs", () => {
    render(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({ loading: true })}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Sitzung wird geladen…",
    );
    expect(
      screen.queryByText("Noch keine Nachrichten in dieser Sitzung."),
    ).toBeNull();
  });

  it("zeigt den Fehler auch ohne sichtbaren Text", () => {
    // Eine Zeile ohne Text traegt nur die Gedanken. Der Fehler darf nicht
    // mit dem Text verschwinden.
    const { container } = render(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [
            message({
              id: "m2",
              role: "assistant",
              text: "",
              status: "complete",
              error: "Verbindung unterbrochen",
            }),
          ],
        })}
      />,
    );
    expect(container.textContent).toContain("Verbindung unterbrochen");
  });

  it("zeigt laufendes Reasoning als Denkt nach, abgeschlossenes als Gedanken", () => {
    const { container, rerender } = render(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [
            message({
              id: "m1",
              role: "assistant",
              text: "Antwort",
              reasoning: "Überlegung",
              status: "streaming",
            }),
          ],
        })}
      />,
    );
    expect(container.textContent).toContain("Denkt nach…");
    rerender(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [
            message({
              id: "m1",
              role: "assistant",
              text: "Antwort",
              reasoning: "Überlegung",
              status: "complete",
            }),
          ],
        })}
      />,
    );
    expect(container.textContent).toContain("Gedanken");
    expect(container.textContent).not.toContain("Denkt nach…");
  });

  it("parst bei Tokenwachs nur die wachsende Zeile neu (zuverlässige Row-Memo)", () => {
    const spy = vi.spyOn(marked, "parse");
    try {
      const stable = message({
        id: "m1",
        role: "assistant",
        text: "Stabile Antwort",
      });
      const view = render(
        <HermesV2MessageList
          onLoadOlder={vi.fn()}
          snapshot={snapshot({
            messages: [
              stable,
              message({ id: "m2", role: "assistant", text: "a" }),
            ],
          })}
        />,
      );
      const afterFirst = spy.mock.calls.length;
      expect(afterFirst).toBe(2);
      view.rerender(
        <HermesV2MessageList
          onLoadOlder={vi.fn()}
          snapshot={snapshot({
            messages: [
              stable,
              message({ id: "m2", role: "assistant", text: "ab" }),
            ],
          })}
        />,
      );
      expect(spy.mock.calls.length).toBe(afterFirst + 1);
    } finally {
      spy.mockRestore();
    }
  });

  it("bietet ältere History als Textlink statt als große Box an", () => {
    const loadOlder = vi.fn();
    const { container } = render(
      <HermesV2MessageList
        onLoadOlder={loadOlder}
        snapshot={snapshot({ hasOlder: true })}
      />,
    );
    const load = container.querySelector("button") as HTMLButtonElement;
    expect(load.className).toContain("hermesv2-history-link");
    expect(load.className).not.toContain("quiet-button");
    expect(load.textContent).toContain("Ältere Nachrichten laden");
  });

  it("bietet ältere History als Bedienelement an", () => {
    const loadOlder = vi.fn();
    const { container, rerender } = render(
      <HermesV2MessageList
        onLoadOlder={loadOlder}
        snapshot={snapshot({ hasOlder: true })}
      />,
    );
    const load = container.querySelector("button") as HTMLButtonElement;
    expect(load.textContent).toContain("Ältere Nachrichten laden");
    fireEvent.click(load);
    expect(loadOlder).toHaveBeenCalledTimes(1);
    expect(load.hasAttribute("disabled")).toBe(false);
    rerender(
      <HermesV2MessageList
        onLoadOlder={loadOlder}
        snapshot={snapshot({ hasOlder: true, loadingOlder: true })}
      />,
    );
    expect(
      (container.querySelector("button") as HTMLButtonElement).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
  });
});

describe("Scrollverhalten", () => {
  afterEach(cleanup);

  function stubScroll(element: HTMLElement, height: number) {
    let scrollHeight = height;
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(element, "clientHeight", {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(element, "scrollTop", {
      configurable: true,
      get: () => Math.min(scrollTop, Math.max(0, scrollHeight - 400)),
      set: (value: number) => {
        scrollTop = value;
      },
    });
    let scrollTop = height - 400;
    return {
      grow: (amount: number) => {
        scrollHeight += amount;
      },
      state: () => ({ scrollTop, scrollHeight }),
    };
  }

  it("setzt nach Sitzungswechsel unten und folgt Streamtokens am unteren Ende", () => {
    const view = render(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [message({ id: "m1", text: "s".repeat(600) })],
        })}
      />,
    );
    const element = view.container.querySelector(
      ".hermesv2-messages",
    ) as HTMLElement;
    const scroll = stubScroll(element, 800);
    element.scrollTop = 800;
    fireEvent.scroll(element);
    expect(scroll.state().scrollTop).toBe(800);
    // Neue Assistant-Zeile und Tokenwachs: unten bleibt unten.
    scroll.grow(200);
    view.rerender(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [
            message({ id: "m1", text: "s".repeat(600) }),
            message({ id: "m2", role: "assistant", text: "Stream" }),
          ],
        })}
      />,
    );
    expect(scroll.state().scrollTop).toBe(1000);
  });

  it("bewahrt bei vorne geladener History die Leseposition", () => {
    const messages = [
      message({ id: "m2", text: "s".repeat(400) }),
      message({ id: "m3", role: "assistant", text: "s".repeat(200) }),
    ];
    const view = render(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({ messages, hasOlder: true })}
      />,
    );
    const element = view.container.querySelector(
      ".hermesv2-messages",
    ) as HTMLElement;
    const scroll = stubScroll(element, 800);
    element.scrollTop = 100; // Nutzer liest oben, nicht am Fuß.
    fireEvent.scroll(element);
    scroll.grow(300); // Ältere Zeile kommt mit Prozessgewinn in die Fläche.
    view.rerender(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [message({ id: "m1", text: "s".repeat(300) }), ...messages],
          hasOlder: false,
        })}
      />,
    );
    // Der bisherige Inhalt wandert um 300 nach unten; bei 100+300=400 bleibt stehen.
    expect(scroll.state().scrollTop).toBe(400);
  });
});

describe("HermesV2RequestDeck: bisheriger Classic-Rückweg", () => {
  afterEach(cleanup);

  it("verdeckt offene Requests nicht und verlinkt in die klassische Sitzung", () => {
    render(
      <MemoryRouter basename="/wrapt" initialEntries={["/wrapt/hermes-v2"]}>
        <HermesV2RequestDeck
          chat={requestChatFixture()}
          interactive
          snapshot={snapshot({
            requests: [
              {
                kind: "approval",
                key: "11111111-1111-4111-8111-111111111111",
                epoch: "e1",
                sessionId: "s1",
                createdAt: 0,
                method: "approval",
                command: "rm -rf /tmp/eigen",
                description: "Löschen einer Datei",
                choices: ["once", "deny"],
              },
            ],
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Freigabe angefragt/)).toBeTruthy();
    const link = screen.getByRole("link", {
      name: /Klassische Hermes-Oberfläche öffnen/,
    });
    expect(link.getAttribute("href")).toBe(
      "/wrapt/hermes-agent?ui=classic&session=s1",
    );
  });

  it("bleibt ohne offene Requests unsichtbar", () => {
    const { container } = render(
      <HermesV2RequestDeck
        chat={requestChatFixture()}
        snapshot={snapshot({ requests: [] })}
        interactive
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
