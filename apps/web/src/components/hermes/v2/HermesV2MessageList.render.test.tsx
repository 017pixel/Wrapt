// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { marked } from "marked";
import type { ChatMessageView, ChatSessionView, ChatToolView } from "./chat-types";
import type * as MessageRowModule from "./HermesV2MessageRow";
import type * as ToolCardModule from "./HermesV2ToolCard";
import { HermesV2MessageList } from "./HermesV2MessageList";

/**
 * Nachweis fuer den flüssigen Verlauf: waehrend des Streams aendert sich
 * nur die betroffene Zeile. Die Zaehler zaehlen echte Zeilen- und
 * Werkzeugkarten-Renderings; React-Memo und die Gruppen-Bremse duerfen
 * unveraenderte Zeilen nicht neu aufbauen.
 */
const counters = vi.hoisted(() => ({ rows: 0, cards: 0 }));

vi.mock("./HermesV2MessageRow", async (importOriginal) => {
  const actual = await importOriginal<typeof MessageRowModule>();
  const { createElement, memo } = await import("react");
  const Spy = memo((props: { message: ChatMessageView }) => {
    counters.rows += 1;
    return createElement(actual.HermesV2MessageRow, props);
  });
  return { ...actual, HermesV2MessageRow: Spy };
});

vi.mock("./HermesV2ToolCard", async (importOriginal) => {
  const actual = await importOriginal<typeof ToolCardModule>();
  const { createElement } = await import("react");
  return {
    ...actual,
    HermesV2ToolCard: (props: { tool: ChatToolView }) => {
      counters.cards += 1;
      return createElement(actual.HermesV2ToolCard, props);
    },
  };
});

function tool(overrides: Partial<ChatToolView> = {}): ChatToolView {
  return {
    id: "tool-1",
    toolId: "call-1",
    turnId: "t1",
    name: "bash",
    status: "complete",
    outcome: "success",
    input: '{"command":"ls -la"}',
    output: "ok",
    durationMs: 1200,
    ...overrides,
  };
}

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

/** Lange Historie: abwechselnd Textzeilen und Werkzeuggruppen. */
function history(count: number): ChatMessageView[] {
  const rows: ChatMessageView[] = [];
  for (let index = 0; index < count; index += 1) {
    if (index % 2 === 0) {
      rows.push(
        message({
          id: `text-${index}`,
          rowId: index,
          role: "assistant",
          text: `Antwort ${index} mit **Fett** und \`Code\`.`,
        }),
      );
    } else {
      rows.push(
        message({
          id: `tool-${index}`,
          rowId: index,
          role: "tool",
          text: "",
          tools: [
            tool({
              id: `tool-${index}`,
              toolId: `call-${index}`,
              name: `werkzeug-${index}`,
              input: `{"command":"echo ${index}"}`,
            }),
          ],
        }),
      );
    }
  }
  return rows;
}

function renderList(rows: readonly ChatMessageView[]) {
  return render(
    <HermesV2MessageList
      onLoadOlder={vi.fn()}
      snapshot={snapshot({ messages: rows as ChatMessageView[] })}
    />,
  );
}

describe("Rendern des Chatverlaufs", () => {
  afterEach(cleanup);

  it("rendert bei einem Token nur die betroffene Zeile", () => {
    const rows = history(200);
    const view = renderList(rows);
    const rowsBefore = counters.rows;
    const cardsBefore = counters.cards;

    // Nur die letzte Textzeile waechst um ein Token.
    const streamed = [...rows];
    const last = streamed.length - 1;
    streamed[last] = { ...streamed[last]!, text: `${streamed[last]!.text} Token` };

    view.rerender(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({ messages: streamed })}
      />,
    );

    // Hoechstens eine Zeile wird neu aufgebaut, keine Werkzeugzeile.
    expect(counters.rows - rowsBefore).toBe(1);
    expect(counters.cards - cardsBefore).toBe(0);
  });

  it("rendert ohne Aenderung keine Zeile neu", () => {
    const rows = history(200);
    const view = renderList(rows);
    const rowsBefore = counters.rows;
    const cardsBefore = counters.cards;

    view.rerender(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({ messages: rows })}
      />,
    );

    expect(counters.rows - rowsBefore).toBe(0);
    expect(counters.cards - cardsBefore).toBe(0);
  });

  it("parst bei Tokenwachs nur das Markdown der betroffenen Zeile", () => {
    const spy = vi.spyOn(marked, "parse");
    try {
      const stable = message({
        id: "stable",
        role: "assistant",
        text: "Stabile Antwort",
      });
      const view = renderList([
        stable,
        message({ id: "live", role: "assistant", text: "a" }),
      ]);
      const afterFirst = spy.mock.calls.length;
      expect(afterFirst).toBe(2);
      view.rerender(
        <HermesV2MessageList
          onLoadOlder={vi.fn()}
          snapshot={snapshot({
            messages: [
              stable,
              message({ id: "live", role: "assistant", text: "ab" }),
            ],
          })}
        />,
      );
      expect(spy.mock.calls.length).toBe(afterFirst + 1);
    } finally {
      spy.mockRestore();
    }
  });

  it("bremst das Markdown waehrend des Streams", () => {
    const spy = vi.spyOn(marked, "parse");
    try {
      const view = renderList([
        message({
          id: "live",
          role: "assistant",
          text: "Anfang",
          status: "streaming",
        }),
      ]);
      const afterFirst = spy.mock.calls.length;
      // Zehn Token in einer Burst: der Parser darf nicht zehnmal laufen.
      for (let step = 1; step <= 10; step += 1) {
        view.rerender(
          <HermesV2MessageList
            onLoadOlder={vi.fn()}
            snapshot={snapshot({
              messages: [
                message({
                  id: "live",
                  role: "assistant",
                  text: `Anfang ${"x".repeat(step)}`,
                  status: "streaming",
                }),
              ],
            })}
          />,
        );
      }
      const parses = spy.mock.calls.length - afterFirst;
      expect(parses).toBeLessThanOrEqual(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("zeigt den Endstand der Antwort ungekuerzt", () => {
    const spy = vi.spyOn(marked, "parse");
    try {
      const view = renderList([
        message({
          id: "live",
          role: "assistant",
          text: "Anfang",
          status: "streaming",
        }),
      ]);
      const final = "Fertige Antwort mit **Fett**";
      view.rerender(
        <HermesV2MessageList
          onLoadOlder={vi.fn()}
          snapshot={snapshot({
            messages: [
              message({
                id: "live",
                role: "assistant",
                text: final,
                status: "complete",
              }),
            ],
          })}
        />,
      );
      expect(view.container.querySelector("strong")?.textContent).toBe("Fett");
      expect(view.container.textContent).toContain("Fertige Antwort mit");
    } finally {
      spy.mockRestore();
    }
  });
});
