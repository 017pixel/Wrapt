// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { HermesV2MessageList } from "./HermesV2MessageList";
import { HermesV2ChatSurface } from "./HermesV2ChatSurface";
import type { ChatSessionView } from "./chat-types";
import type { HermesV2ReadView, ReadGeneration } from "./sidebar-types";
import { testGeneration } from "./sidebar-test-fixtures";
import { emptyChatComposer } from "./chat-composer-types";
import { emptyChatWork } from "./chat-work-types";

/** Kleiner IntersectionObserver-Stub mit steuerbaren Schnittmengen. */
class StubIntersectionObserver {
  static instances: StubIntersectionObserver[] = [];
  static last: StubIntersectionObserver | null = null;
  callbacks: IntersectionObserverCallback[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(callback: IntersectionObserverCallback) {
    this.callbacks.push(callback);
    StubIntersectionObserver.instances.push(this);
    StubIntersectionObserver.last = this;
  }
  observe(element: Element) {
    this.observed.push(element);
  }
  unobserve(element: Element) {
    this.observed = this.observed.filter((entry) => entry !== element);
  }
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [0];
  intersect(handles: string[]) {
    const matching = this.observed.filter((element) =>
      handles.includes((element as HTMLElement).dataset.readEvidence ?? ""),
    );
    this.callbacks[0]!(
      matching.map(
        (element) =>
          ({
            target: element,
            isIntersecting: true,
            intersectionRatio: 1,
          }) as unknown as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

const snapshot = (messages: ChatSessionView["messages"]): ChatSessionView => ({
  sessionId: "s1",
  session: null,
  epoch: "e",
  cursor: 0,
  generation: 1,
  loading: false,
  hasOlder: false,
  loadingOlder: false,
  error: null,
  messages,
  tools: [],
  requests: [],
  generatingTool: null,
  queuedText: null,
  running: false,
  writable: true,
  blockedReason: null,
  turnStartedAt: null,
  selection: null,
  reasoningEffort: null,
  subagents: [],
  background: [],
  usage: null,
  catalog: { commands: [], models: null, loading: false, error: null },
});

const message = (overrides: Record<string, unknown> = {}) => ({
  id: "m1",
  rowId: 1,
  logicalId: "l1",
  role: "assistant" as const,
  text: "Antwort",
  reasoning: null,
  timestamp: 1,
  status: "complete" as const,
  error: null,
  tools: [],
  ...overrides,
});

const readView = (
  generation: ReadGeneration | null,
  sessionId: string | null,
  onVisibleEvidence: HermesV2ReadView["onVisibleEvidence"],
): HermesV2ReadView => ({
  generation,
  sessionId,
  notices: [],
  loading: false,
  hasMore: false,
  error: null,
  loadMore: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn().mockResolvedValue(undefined),
  onVisibleEvidence,
});

describe("sichtbarer Read-Observer", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    StubIntersectionObserver.instances = [];
    StubIntersectionObserver.last = null;
  });

  it("bestätigt nur sichtbare, vollständige Rows mit Beleg und bündelt Handles", async () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const onVisibleEvidence = vi.fn().mockResolvedValue(undefined);
    render(
      <HermesV2MessageList
        snapshot={snapshot([
          message({ id: "a", readEvidence: "aa" }),
          message({ id: "b", status: "streaming", readEvidence: "bb" }),
          message({ id: "c", role: "user", readEvidence: "cc" }),
        ])}
        onLoadOlder={() => undefined}
        active
        readView={readView(testGeneration, "s1", onVisibleEvidence)}
      />,
    );
    const markers = StubIntersectionObserver.last!.observed;
    expect(markers).toHaveLength(1); // nur die vollständige Assistant-Row
    StubIntersectionObserver.last!.intersect(["aa", "bb", "cc"]);
    await waitFor(() => expect(onVisibleEvidence).toHaveBeenCalled());
    expect(onVisibleEvidence).toHaveBeenCalledWith(testGeneration, ["aa"]);
  });

  it("geparkte/versteckte Flächen bestätigen nichts", () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const onVisibleEvidence = vi.fn().mockResolvedValue(undefined);
    render(
      <HermesV2MessageList
        snapshot={snapshot([message({ readEvidence: "aa" })])}
        onLoadOlder={() => undefined}
        active={false}
        readView={readView(testGeneration, "s1", onVisibleEvidence)}
      />,
    );
    expect(StubIntersectionObserver.last).toBeNull();
  });

  it("alte Observer lesen nach Generationswechsel keine neue Auswahl", async () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const onVisibleEvidence = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <HermesV2MessageList
        snapshot={snapshot([message({ readEvidence: "aa" })])}
        onLoadOlder={() => undefined}
        active
        readView={readView(testGeneration, "s1", onVisibleEvidence)}
      />,
    );
    const oldObserver = StubIntersectionObserver.last!;
    const newGeneration = {} as ReadGeneration;
    rerender(
      <HermesV2MessageList
        snapshot={snapshot([message({ readEvidence: "aa" })])}
        onLoadOlder={() => undefined}
        active
        readView={readView(newGeneration, "s1", onVisibleEvidence)}
      />,
    );
    expect(oldObserver.disconnected).toBe(true);
    oldObserver.intersect(["aa"]);
    StubIntersectionObserver.last!.intersect(["aa"]);
    await waitFor(() => expect(onVisibleEvidence).toHaveBeenCalled());
    expect(onVisibleEvidence).toHaveBeenCalledWith(newGeneration, ["aa"]);
  });

  it("readActive=false (mobiles Drawer-Overlay) hält den Chat-Read an, nicht die Sidebar", () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const onVisibleEvidence = vi.fn().mockResolvedValue(undefined);
    useAppPreferences.setState({ hermesV2Enabled: true });
    render(
      <HermesV2ChatSurface
        chat={
          {
            connection: { state: "online", attempt: 0, error: null },
            sessions: {
              items: [],
              loading: false,
              hasMore: false,
              error: null,
            },
            activeSnapshot: snapshot([message({ readEvidence: "aa" })]),
            draft: "",
            submitting: false,
            actionError: null,
            unknownSend: null,
            requestStates: [],
            composer: emptyChatComposer,
            work: emptyChatWork,
            refreshWork: vi.fn().mockResolvedValue(undefined),
            interruptSubagent: vi.fn().mockResolvedValue(undefined),
            readSubagentTail: vi.fn().mockResolvedValue(undefined),
            killProcess: vi.fn().mockResolvedValue(undefined),
            startBackground: vi.fn().mockResolvedValue(undefined),
            startBtw: vi.fn().mockResolvedValue(undefined),
            setTitle: vi.fn().mockResolvedValue(undefined),
            selectReasoning: vi.fn().mockResolvedValue(undefined),
            uploadAttachment: vi.fn().mockResolvedValue(undefined),
            removeAttachment: vi.fn(),
            checkUpload: vi.fn().mockResolvedValue(undefined),
            cancelModelSelection: vi.fn(),
            setDraft: () => undefined,
            selectSession: () => undefined,
            refreshSessions: vi.fn(),
            createSession: vi.fn(),
            submit: vi.fn(),
            stop: vi.fn(),
            steer: vi.fn(),
            loadOlder: vi.fn(),
            readCatalog: vi.fn(),
            selectModel: vi.fn(),
            respond: vi.fn(),
            lockRequest: vi.fn(),
            resync: vi.fn(),
            resendUnknown: vi.fn(),
            continueWithoutResend: vi.fn(),
            reconnect: vi.fn(),
            clearError: () => undefined,
          } as never
        }
        active
        variant="route"
        onNewSession={() => undefined}
        readActive={false}
        readView={readView(testGeneration, "s1", onVisibleEvidence)}
      />,
    );
    expect(StubIntersectionObserver.last).toBeNull();
    expect(screen.getByRole("log", { name: "Chatverlauf" })).toBeTruthy();
  });

  it("Notice-Zeilen tragen den generischen Text und werden beobachtbar", () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const onVisibleEvidence = vi.fn().mockResolvedValue(undefined);
    const view = readView(testGeneration, "s1", onVisibleEvidence);
    (view as unknown as { notices: unknown[] }).notices = [
      {
        id: "n1",
        kind: "historical-decision-error",
        text: "Historischer Agent-Fehler. Details sind nicht mehr verfügbar.",
        observedAt: 1,
        completedAt: null,
        readEvidence: "ee",
      },
      {
        id: "n2",
        kind: "unavailable-content",
        text: "Inhalt nicht verfügbar.",
        observedAt: 2,
        completedAt: null,
        readEvidence: null,
      },
    ];
    render(
      <HermesV2MessageList
        snapshot={snapshot([])}
        onLoadOlder={() => undefined}
        active
        readView={view}
      />,
    );
    expect(
      screen.getByText(
        "Historischer Agent-Fehler. Details sind nicht mehr verfügbar.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Inhalt nicht verfügbar.")).toBeTruthy();
    const handles = StubIntersectionObserver.last!.observed.map(
      (element) => (element as HTMLElement).dataset.readEvidence,
    );
    expect(handles).toEqual(["ee"]);
  });

  it("Sichtbarkeitswechsel versteckter Tabs bestätigt nicht erneut", async () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const onVisibleEvidence = vi.fn().mockResolvedValue(undefined);
    render(
      <HermesV2MessageList
        snapshot={snapshot([message({ readEvidence: "aa" })])}
        onLoadOlder={() => undefined}
        active
        readView={readView(testGeneration, "s1", onVisibleEvidence)}
      />,
    );
    StubIntersectionObserver.last!.intersect(["aa"]);
    // Doppelte Schnittmengen desselben Markers werden dedupliziert.
    StubIntersectionObserver.last!.intersect(["aa"]);
    await waitFor(() => expect(onVisibleEvidence).toHaveBeenCalled());
    expect(onVisibleEvidence).toHaveBeenCalledTimes(1);
    expect(onVisibleEvidence.mock.calls[0]?.[1]).toEqual(["aa"]);
    expect(document.querySelector(".hermesv2-read-end")).toBeTruthy();
  });

  it("erkennt Belege, die nach dem ersten Aufbau entstehen", async () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const onVisibleEvidence = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <HermesV2MessageList
        snapshot={snapshot([message({ id: "a" })])}
        onLoadOlder={() => undefined}
        active
        readView={readView(testGeneration, "s1", onVisibleEvidence)}
      />,
    );
    // Ohne Beleg gibt es keinen Endmarker und damit nichts zu beobachten.
    expect(StubIntersectionObserver.last!.observed).toHaveLength(0);
    rerender(
      <HermesV2MessageList
        snapshot={snapshot([message({ id: "a", readEvidence: "aa" })])}
        onLoadOlder={() => undefined}
        active
        readView={readView(testGeneration, "s1", onVisibleEvidence)}
      />,
    );
    await waitFor(() =>
      expect(StubIntersectionObserver.last!.observed).toHaveLength(1),
    );
    StubIntersectionObserver.last!.intersect(["aa"]);
    await waitFor(() =>
      expect(onVisibleEvidence).toHaveBeenCalledWith(testGeneration, ["aa"]),
    );
  });

  it("Fire-and-forget: MessageList bleibt ohne Read-Weg funktionsfähig", () => {
    render(
      <HermesV2MessageList
        snapshot={snapshot([message()])}
        onLoadOlder={() => undefined}
        active
      />,
    );
    fireEvent.scroll(screen.getByRole("log"));
    expect(screen.getByText("Antwort")).toBeTruthy();
  });
});
