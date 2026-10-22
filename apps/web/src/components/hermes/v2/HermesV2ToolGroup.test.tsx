// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessageView, ChatSessionView, ChatToolView } from "./chat-types";
import { HermesV2MessageList } from "./HermesV2MessageList";

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
    role: "assistant",
    text: "",
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

function renderList(overrides: Partial<ChatSessionView>) {
  return render(
    <HermesV2MessageList onLoadOlder={vi.fn()} snapshot={snapshot(overrides)} />,
  );
}

describe("Werkzeuggruppen im Chatverlauf", () => {
  it("fasst 16 Gedankenfragmente in einer Box zusammen und hält sie beim Streamen offen", () => {
    const messages = Array.from({ length: 16 }, (_, index) => message({
      id: `thought-${index}`, reasoning: `Gedanke ${index + 1}`,
    }));
    const { container, rerender } = renderList({ messages });
    expect(container.querySelectorAll(".hermesv2-reasoning")).toHaveLength(1);
    const details = container.querySelector(".hermesv2-reasoning") as HTMLDetailsElement;
    fireEvent.click(details.querySelector("summary")!);
    expect(details.open).toBe(true);
    expect(details.querySelector("[role='region']")?.textContent).toContain("Gedanke 16");
    rerender(<HermesV2MessageList onLoadOlder={vi.fn()} snapshot={snapshot({
      messages: [...messages, message({ id: "thought-17", reasoning: "Weitergedacht" })],
    })} />);
    expect(container.querySelector(".hermesv2-reasoning")).toBe(details);
    expect(details.open).toBe(true);
    expect(details.textContent).toContain("Weitergedacht");
  });

  afterEach(cleanup);

  it("gruppiert aufeinanderfolgende Aufrufe in einen einklappbaren Block", () => {
    const { container } = renderList({
      messages: [
        message({ id: "a", text: "Antwort" }),
        message({
          id: "b",
          role: "tool",
          tools: [tool({ id: "t1", durationMs: 8000 })],
        }),
        message({
          id: "c",
          role: "tool",
          tools: [tool({ id: "t2", durationMs: 1100 })],
        }),
      ],
    });
    const groups = container.querySelectorAll(".hermesv2-tool-group");
    expect(groups).toHaveLength(1);
    const group = groups[0] as HTMLDetailsElement;
    expect(group.hasAttribute("open")).toBe(false);
    expect(group.textContent).toContain("Gearbeitet für 9,1 s");
    fireEvent.click(group.querySelector("summary") as HTMLElement);
    expect(group.hasAttribute("open")).toBe(true);
    expect(container.querySelectorAll(".hermesv2-tool")).toHaveLength(2);
  });

  it("zeigt im Kopf die Zeit bis zur Antwort", () => {
    const { container } = renderList({
      messages: [
        message({ id: "a", role: "user", text: "Frage", timestamp: 1_000 }),
        message({
          id: "b",
          role: "tool",
          text: "",
          tools: [tool({ id: "t1", durationMs: 800 })],
          timestamp: 5_000,
        }),
        message({
          id: "c",
          role: "tool",
          text: "",
          tools: [tool({ id: "t2", durationMs: 900 })],
          timestamp: 9_000,
        }),
        message({ id: "d", text: "Antwort", timestamp: 39_000 }),
      ],
    });
    const group = container.querySelector(".hermesv2-tool-group") as HTMLElement;
    expect(group.textContent).toContain("Gearbeitet für 38 s");
    // Die Summe der Einzeldauern waere 1,7 s - sie darf hier nicht stehen.
    expect(group.textContent).not.toContain("1,7 s");
  });

  it("stellt den Kopf auf die Antwort um, wenn sie eintrifft", () => {
    const vorher = [
      message({ id: "a", role: "user", text: "Frage", timestamp: 1_000 }),
      message({
        id: "b",
        role: "tool",
        text: "",
        tools: [tool({ id: "t1", durationMs: 800 })],
        timestamp: 5_000,
      }),
      message({
        id: "c",
        role: "tool",
        text: "",
        tools: [tool({ id: "t2", durationMs: 900 })],
        timestamp: 9_000,
      }),
    ];
    const view = renderList({ messages: vorher });
    expect(
      view.container.querySelector(".hermesv2-tool-group")?.textContent,
    ).toContain("Gearbeitet für 1,7 s");
    view.rerender(
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [
            ...vorher,
            message({ id: "d", text: "Antwort", timestamp: 39_000 }),
          ],
        })}
      />,
    );
    expect(
      view.container.querySelector(".hermesv2-tool-group")?.textContent,
    ).toContain("Gearbeitet für 38 s");
  });

  it("zeigt je Zeile Name, Zusammenfassung und Details", () => {
    const { container } = renderList({
      messages: [
        message({
          id: "b",
          role: "tool",
          tools: [
            tool({
              id: "t1",
              name: "browser",
              input: '{"text":"Seite öffnen"}',
              output: "Titel gefunden",
            }),
          ],
        }),
      ],
    });
    const row = container.querySelector(".hermesv2-tool") as HTMLDetailsElement;
    expect(row.textContent).toContain("browser");
    expect(
      row.querySelector(".hermesv2-tool-summary")?.textContent,
    ).toBe("Seite öffnen");
    expect(row.hasAttribute("open")).toBe(false);
    fireEvent.click(row.querySelector("summary") as HTMLElement);
    expect(row.hasAttribute("open")).toBe(true);
    expect(row.textContent).toContain("Titel gefunden");
  });

  it("behält den Hinweis auf unbekanntes Ergebnis", () => {
    const { container } = renderList({
      messages: [
        message({
          id: "b",
          role: "tool",
          tools: [tool({ id: "t1", outcome: "unknown", durationMs: null })],
        }),
      ],
    });
    // Ein einzelner Aufruf steht ohne Gruppenkopf in der Liste.
    const group = container.querySelector(".hermesv2-tool-group") as HTMLElement;
    expect(group.className).toContain("is-single");
    expect(group.textContent).not.toContain("Gearbeitet");
    const row = container.querySelector(".hermesv2-tool") as HTMLDetailsElement;
    fireEvent.click(row.querySelector("summary") as HTMLElement);
    expect(row.textContent).toContain("kein Beleg");
  });

  it("nennt die Zahl der Aufrufe, wenn keine Dauer belegt ist", () => {
    const { container } = renderList({
      messages: [
        message({
          id: "b",
          role: "tool",
          tools: [
            tool({ id: "t1", durationMs: null }),
            tool({ id: "t2", durationMs: null }),
          ],
        }),
      ],
    });
    const group = container.querySelector(".hermesv2-tool-group") as HTMLElement;
    expect(group.textContent).toContain("Gearbeitet · 2 Aufrufe");
    expect(group.textContent).not.toContain("Gearbeitet für");
  });

  it("zeigt einen einzelnen laufenden Aufruf als Vorschau ohne Gruppenkopf", () => {
    const { container } = renderList({
      messages: [
        message({
          id: "b",
          role: "tool",
          tools: [tool({ id: "t1", status: "running", durationMs: null })],
        }),
      ],
    });
    expect(container.querySelector(".hermesv2-tool-group")).toBeNull();
    const row = container.querySelector(".hermesv2-tool") as HTMLElement;
    expect(row.textContent).toContain("bash");
    expect(row.textContent).toContain("läuft");
  });

  it("führt den laufenden Werkzeughinweis in die Gruppe über", () => {
    const { container } = renderList({
      messages: [
        message({
          id: "b",
          role: "tool",
          tools: [tool({ id: "t1", durationMs: 8000 })],
        }),
      ],
      generatingTool: "browser",
    });
    expect(container.textContent).not.toContain("Werkzeug läuft:");
    const group = container.querySelector(".hermesv2-tool-group") as HTMLElement;
    // Der Inhalt der Gruppe entsteht erst beim Öffnen; vorher liegt er
    // nicht im DOM.
    expect(container.querySelectorAll(".hermesv2-tool")).toHaveLength(0);
    fireEvent.click(group.querySelector("summary") as HTMLElement);
    expect(group.textContent).toContain("browser");
    expect(group.textContent).toContain("läuft");
    expect(container.querySelectorAll(".hermesv2-tool")).toHaveLength(2);
  });
});
