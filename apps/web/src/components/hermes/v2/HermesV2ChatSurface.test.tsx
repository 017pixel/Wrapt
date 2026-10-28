// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChatErrorInfo,
  ChatSessionView,
  HermesV2Chat,
  UnknownSendView,
} from "./chat-types";
import { MemoryRouter } from "react-router";
import { HermesV2ChatSurface } from "./HermesV2ChatSurface";
import { emptyChatComposer } from "./chat-composer-types";
import { emptyChatWork } from "./chat-work-types";
import { approvalRequest } from "./request-card-fixtures";
import { subagentRow } from "./work-panel-fixtures";

const approvalCardRequest = () => approvalRequest();
function snapshot(overrides: Partial<ChatSessionView> = {}): ChatSessionView {
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

function chatFixture(
  overrides: Partial<HermesV2Chat> & {
    activeSnapshot?: ChatSessionView | null;
  } = {},
): HermesV2Chat {
  return {
    connection: { state: "online", attempt: 0, error: null },
    sessions: { items: [], loading: false, hasMore: false, error: null },
    activeSnapshot: null,
    draft: "",
    submitting: false,
    actionError: null,
    unknownSend: null,
    setDraft: vi.fn(),
    selectSession: vi.fn(),
    refreshSessions: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue("neu"),
    submit: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    steer: vi.fn().mockResolvedValue(undefined),
    loadOlder: vi.fn().mockResolvedValue(undefined),
    readCatalog: vi.fn().mockResolvedValue(undefined),
    selectModel: vi.fn().mockResolvedValue(undefined),
    respond: vi.fn().mockResolvedValue(undefined),
    lockRequest: vi.fn().mockResolvedValue(undefined),
    cancelModelSelection: vi.fn(),
    setTitle: vi.fn().mockResolvedValue(undefined),
    selectReasoning: vi.fn().mockResolvedValue(undefined),
    setApprovalMode: vi.fn().mockResolvedValue(undefined),
    uploadAttachment: vi.fn().mockResolvedValue(undefined),
    removeAttachment: vi.fn(),
    checkUpload: vi.fn().mockResolvedValue(undefined),
    requestStates: [],
    resync: vi.fn().mockResolvedValue(undefined),
    resendUnknown: vi.fn().mockResolvedValue(undefined),
    continueWithoutResend: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn(),
    clearError: vi.fn(),
    composer: emptyChatComposer,
    work: emptyChatWork,
    refreshWork: vi.fn().mockResolvedValue(undefined),
    interruptSubagent: vi.fn().mockResolvedValue(undefined),
    readSubagentTail: vi.fn().mockResolvedValue(undefined),
    killProcess: vi.fn().mockResolvedValue(undefined),
    startBackground: vi.fn().mockResolvedValue(undefined),
    startBtw: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Nativer Queuekopf in der Chatfläche", () => {
  afterEach(cleanup);

  it.each([false, true])("bleibt bei zugeklappter Aufgabenregion einmal sichtbar, roster=%s", (observed) => {
    const chat = chatFixture({
      activeSnapshot: snapshot({ running: true, queuedText: "Echter erster Queuekopf" }),
      work: { ...emptyChatWork, available: true, revision: observed ? 1 : null,
        subagents: [subagentRow()],
        queue: { observed, head: observed ? "Echter erster Queuekopf" : null } },
    });
    render(<MemoryRouter><HermesV2ChatSurface chat={chat} active variant="route" onNewSession={vi.fn()} /></MemoryRouter>);
    expect(screen.getAllByRole("status", { name: "Nächste eingereihte Nachricht" })).toHaveLength(1);
    expect(screen.getByRole("status", { name: "Nächste eingereihte Nachricht" }).textContent).toContain("Echter erster Queuekopf");
    fireEvent.click(screen.getByRole("button", { name: "Aufgaben anzeigen" }));
    expect(screen.getAllByRole("status", { name: "Nächste eingereihte Nachricht" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Aufgaben ausblenden" }));
    expect(screen.getAllByRole("status", { name: "Nächste eingereihte Nachricht" })).toHaveLength(1);
  });

  it("erhält Eingabe und Stop, wenn bereits eine native Folgenachricht eingereiht ist", () => {
    const chat = chatFixture({ activeSnapshot: snapshot({ running: true, queuedText: "Erster Queuekopf" }) });
    render(<MemoryRouter><HermesV2ChatSurface chat={chat} active variant="route" onNewSession={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("textbox", { name: "Nachricht an Hermes" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Stoppen" })).toHaveProperty("disabled", false);
  });
});

describe("Leerzustand der Chatfläche", () => {
  afterEach(cleanup);

  it("zeigt eine große Überschrift mit der ruhigen Zeile darunter, ohne Bild", () => {
    const { container } = render(
      <MemoryRouter>
        <HermesV2ChatSurface
          chat={chatFixture()}
          active
          variant="route"
          onNewSession={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Was möchten wir in Hermes bauen?",
    );
    expect(container.textContent).toContain("oder ohne Projekt beginnen");
    expect(container.querySelector(".hermesv2-welcome-icon")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("Verdeckte Aufgabenansicht", () => {
  afterEach(cleanup);

  it("schließt offene Zeilendetails auch über den Sichtbarkeitsvertrag der Chatfläche", () => {
    const chat = chatFixture({ activeSnapshot: snapshot(),
      work: { ...emptyChatWork, available: true, revision: 1, subagents: [subagentRow()] } });
    const surface = (visible: boolean) => <MemoryRouter><HermesV2ChatSurface chat={chat} active
      readActive={visible} variant="route" onNewSession={vi.fn()} /></MemoryRouter>;
    const { rerender } = render(surface(true));
    fireEvent.click(screen.getByRole("button", { name: "Aufgaben anzeigen" }));
    const label = "Unteraufgabe aufklappen: Unteraufgabe recherchieren";
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-expanded")).toBe("true");
    rerender(surface(false)); rerender(surface(true));
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Sessionfehler (F1)", () => {
  afterEach(cleanup);

  it("zeigt dieselbe Fehlerursache aus mehreren Quellen nur einmal", () => {
    const error: ChatErrorInfo = { code: "not_writable", message: "Die Sitzung ist nur lesbar.", outcome: "not_sent" };
    const chat = chatFixture({
      activeSnapshot: snapshot({ writable: false, blockedReason: error.message, error,
        catalog: { commands: [], models: null, loading: false, error } }),
      actionError: error,
      work: { ...emptyChatWork, error },
    });
    const { rerender } = render(<HermesV2ChatSurface chat={chat} active variant="route" onNewSession={vi.fn()} />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Erneut abgleichen" })).toBeTruthy();
    rerender(<HermesV2ChatSurface chat={chat} active={false} variant="route" onNewSession={vi.fn()} />);
    expect(document.querySelector(".hermesv2-toast")).toBeNull();
  });

  it("zeigt snapshot.error nachvollziehbar als Meldung mit Abgleich-Aktion, ohne Rohpayload", () => {
    const error: ChatErrorInfo = {
      code: "event_buffer_overflow",
      message: "Ereignisabgleich für diese Sitzung nötig.",
      outcome: "not_sent",
    };
    const chat = chatFixture({ activeSnapshot: snapshot({ error }) });
    const { container } = render(
      <HermesV2ChatSurface
        chat={chat}
        active
        variant="route"
        onNewSession={vi.fn()}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(alert.closest(".hermesv2-toasts")).toBeTruthy();
    expect(alert?.textContent).toContain(
      "Ereignisabgleich für diese Sitzung nötig.",
    );
    expect(alert?.textContent).not.toContain("event_buffer_overflow");
    fireEvent.click(screen.getByRole("button", { name: "Erneut abgleichen" }));
    expect(chat.resync).toHaveBeenCalledTimes(1);
  });

  it("zeigt den Fehler auch neben ReadOnly an, die Ursache statt nur dem generischen Text", () => {
    const error: ChatErrorInfo = {
      code: "subscribe",
      message: "Anmeldung an der Sitzung fehlgeschlagen.",
      outcome: "not_sent",
    };
    render(
      <HermesV2ChatSurface
        chat={chatFixture({
          activeSnapshot: snapshot({
            error,
            writable: false,
            blockedReason: "Nur lesend.",
          }),
        })}
        active
        variant="panel"
        onNewSession={vi.fn()}
      />,
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Anmeldung an der Sitzung fehlgeschlagen.",
    );
    expect(document.body.textContent).toContain("Nur lesend.");
  });
});

describe("Bewusst erneut senden (F5)", () => {
  afterEach(cleanup);

  function unknown(overrides: Partial<UnknownSendView>): UnknownSendView {
    return {
      operation: "message.submit",
      warning: "Es ist unklar, ob die Nachricht gesendet wurde.",
      resynced: false,
      canResend: true,
      ...overrides,
    };
  }

  it("hält die destruktive Aktion zurück, solange der Abgleich nicht abgeschlossen ist", () => {
    const chat = chatFixture({
      activeSnapshot: snapshot(),
      unknownSend: unknown({}),
    });
    render(
      <HermesV2ChatSurface
        chat={chat}
        active
        variant="route"
        onNewSession={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Es ist unklar, ob die Nachricht gesendet wurde."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Bewusst erneut senden" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Abgleichen" })).toBeTruthy();
  });

  it("bietet das erneute Senden erst nach abgeschlossenem Abgleich mit eigener Nutzeraktion an", () => {
    const chat = chatFixture({
      activeSnapshot: snapshot(),
      unknownSend: unknown({ resynced: true }),
    });
    render(
      <HermesV2ChatSurface
        chat={chat}
        active
        variant="route"
        onNewSession={vi.fn()}
      />,
    );
    const resend = screen.getByRole("button", {
      name: "Bewusst erneut senden",
    });
    fireEvent.click(resend);
    expect(chat.resendUnknown).toHaveBeenCalledWith({
      acknowledgeDuplicateRisk: true,
    });
    expect(
      screen.getByRole("button", { name: "Ohne erneutes Senden fortfahren" }),
    ).toBeTruthy();
  });
});

describe("Eingereihte Nachricht einmal (F6)", () => {
  afterEach(cleanup);

  it("zeigt eingereihten Text nur an einer Stelle", () => {
    const { container } = render(
      <HermesV2ChatSurface
        chat={chatFixture({
          activeSnapshot: snapshot({ queuedText: "Später gesendet" }),
        })}
        active
        variant="route"
        onNewSession={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".hermesv2-queue-note")).toHaveLength(0);
    expect(container.textContent.split("Später gesendet")).toHaveLength(2);
  });
});

describe("Offene Anfragen in der Chatfläche", () => {
  afterEach(cleanup);

  it("rendert offene Anfragen als natives Deck mit Classic-Einstieg", () => {
    const chat = chatFixture({
      activeSnapshot: snapshot({ requests: [approvalCardRequest()] }),
    });
    const { container } = render(
      <MemoryRouter>
        <HermesV2ChatSurface
          chat={chat}
          active
          variant="route"
          onNewSession={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      container.querySelector("[data-request-kind='approval']"),
    ).toBeTruthy();
    expect(container.querySelector("input[type='password']")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Klassische Hermes-Oberfläche öffnen" }),
    ).toBeTruthy();
  });

  it("geparkte oder verdeckte Fläche sperrt die Kartenaktionen synchron", () => {
    const chat = chatFixture({
      activeSnapshot: snapshot({ requests: [approvalCardRequest()] }),
    });
    const { rerender } = render(
      <MemoryRouter>
        <HermesV2ChatSurface
          chat={chat}
          active
          variant="route"
          onNewSession={vi.fn()}
          readActive={false}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled"),
    ).toBe(true); // readActive=false
    rerender(
      <MemoryRouter>
        <HermesV2ChatSurface
          chat={chat}
          active={false}
          variant="panel"
          onNewSession={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled"),
    ).toBe(true); // active=false
  });
});
