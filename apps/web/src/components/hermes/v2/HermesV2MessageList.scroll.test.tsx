// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessageView, ChatSessionView } from "./chat-types";
import { HermesV2MessageList } from "./HermesV2MessageList";

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

describe("Nachlaufen des Verlaufs", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("folgt dem Wachstum der Antwort, wenn am Ende gelesen wird", () => {
    // Das gebremste Markdown waechst nach der Bremse und damit ausserhalb der
    // Nachrichtenliste. Wer am Ende liest, soll trotzdem mitwandern.
    vi.useFakeTimers();
    const ansicht = (text: string) => (
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [
            message({ id: "m2", role: "assistant", text, status: "streaming" }),
          ],
        })}
      />
    );
    const { container, rerender } = render(ansicht("Antwort"));
    const element = container.querySelector(".hermesv2-messages") as HTMLElement;
    // Der Inhalt waechst von 800 auf 1200, waehrend der Nutzer am Ende steht.
    let hoehe = 800;
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      get: () => hoehe,
    });
    Object.defineProperty(element, "clientHeight", {
      configurable: true,
      value: 400,
    });
    element.scrollTop = 400;
    fireEvent.scroll(element);
    rerender(ansicht("Antwort mit mehr Text"));
    act(() => {
      hoehe = 1200;
      vi.advanceTimersByTime(300);
    });
    expect(element.scrollTop).toBe(1200);
  });

  it("bleibt stehen, wenn der Nutzer nach oben liest", () => {
    vi.useFakeTimers();
    const ansicht = (text: string) => (
      <HermesV2MessageList
        onLoadOlder={vi.fn()}
        snapshot={snapshot({
          messages: [
            message({ id: "m2", role: "assistant", text, status: "streaming" }),
          ],
        })}
      />
    );
    const { container, rerender } = render(ansicht("Antwort"));
    const element = container.querySelector(".hermesv2-messages") as HTMLElement;
    let hoehe = 800;
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      get: () => hoehe,
    });
    Object.defineProperty(element, "clientHeight", {
      configurable: true,
      value: 400,
    });
    // Der Nutzer liest weiter oben: 800 - 200 - 400 = 200 Pixel Abstand.
    element.scrollTop = 200;
    fireEvent.scroll(element);
    rerender(ansicht("Antwort mit mehr Text"));
    act(() => {
      hoehe = 1200;
      vi.advanceTimersByTime(300);
    });
    expect(element.scrollTop).toBe(200);
  });
});
