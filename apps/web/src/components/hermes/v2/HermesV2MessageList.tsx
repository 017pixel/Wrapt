import { useCallback, useLayoutEffect, useRef, type ReactElement } from "react";
import type { ChatMessageView, ChatSessionView } from "./chat-types";
import { HermesV2MessageRow } from "./HermesV2MessageRow";
import { HermesV2ToolGroup } from "./HermesV2ToolGroup";
import { groupToolBlocks, withRunningTool } from "./tool-group";
import { useHermesV2ReadObserver } from "./useHermesV2ReadObserver";
import type { HermesV2ReadView } from "./sidebar-types";

/** Optionale Belegprojektion der Chat-Nachrichten (nur lesen, nie erzeugen). */
export type MessageWithEvidence = ChatSessionView["messages"][number] & {
  readEvidence?: string | null;
};

/** Wiederverwendete Zeile: dieselbe Nachricht, dasselbe Element. */
type CachedRow = { message: ChatMessageView; element: ReactElement };

const noticeLabels: Record<string, string> = {
  "historical-decision-error": "Hinweis",
  "decision-error": "Fehler",
  "unavailable-content": "Inhalt nicht verfügbar",
};

/**
 * Chronologische Nachrichtenliste. Auto-Scroll entscheidet anhand der Messung
 * vor dem DOM-Update (Listener hält height/top/clientHeight), damit wachsende
 * Streams unten weiterlaufen, aber Lesen oberhalb ruhig bleibt. Nachgeladene
 * ältere History verschiebt die Mitleserposition nicht.
 */
export function HermesV2MessageList({
  snapshot,
  onLoadOlder,
  active = false,
  readView,
  queuedInView = true,
}: {
  snapshot: ChatSessionView;
  onLoadOlder: () => void;
  active?: boolean;
  readView?: HermesV2ReadView | undefined;
  /** Der Queuekopf kann in der Aufgabenansicht stehen; genau eine Anzeige bleibt. */
  queuedInView?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = snapshot.messages;
  // Aufeinanderfolgende Werkzeugaufrufe werden gruppiert; der laufende
  // Aufruf wandert in die letzte Gruppe statt in eine eigene Meldung.
  const blocks = withRunningTool(
    groupToolBlocks(messages),
    snapshot.generatingTool,
  );
  const midi = useRef({
    height: 0,
    top: 0,
    clientHeight: 0,
    topId: null as string | null,
    sessionId: snapshot.sessionId,
  });
  // Unveraenderte Zeilen behalten ihr Element. React ueberspringt dann den
  // ganzen Teilbaum, statt ihn bei jedem Token neu abzugleichen.
  const rowCache = useRef(new Map<string, CachedRow>());

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const handleScroll = () => {
      midi.current.height = element.scrollHeight;
      midi.current.top = element.scrollTop;
      midi.current.clientHeight = element.clientHeight;
    };
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, []);

  // Das gebremste Markdown waechst ausserhalb der Nachrichtenliste. Wer am
  // Ende des Verlaufs liest, soll trotzdem mitwandern.
  const followGrowth = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Entscheidend ist die Position VOR dem Wachstum: die neue Hoehe wuerde
    // sonst jeden Leser nach oben wirken lassen.
    const previous = midi.current;
    const amEnde =
      previous.height - previous.top - previous.clientHeight < 48;
    if (!amEnde) return;
    element.scrollTop = element.scrollHeight;
    midi.current = {
      height: element.scrollHeight,
      top: element.scrollTop,
      clientHeight: element.clientHeight,
      topId: previous.topId,
      sessionId: previous.sessionId,
    };
  }, []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const topId = messages[0]?.id ?? null;
    const previous = midi.current;
    const sessionChanged = previous.sessionId !== snapshot.sessionId;
    if (sessionChanged) {
      // Anfang und Sitzungswechsel enden unten und merken die Position.
      element.scrollTop = element.scrollHeight;
      midi.current = {
        height: element.scrollHeight,
        top: element.scrollTop,
        clientHeight: element.clientHeight,
        topId,
        sessionId: snapshot.sessionId,
      };
      return;
    }
    // Prepend nur, wenn die bisherige erste Zeile noch vorhanden ist und
    // davor neue Zeilen angefügt wurden (geladene ältere History).
    const previousFirstIndex =
      topId === null || previous.topId === null
        ? -1
        : messages.findIndex((message) => message.id === previous.topId);
    if (previousFirstIndex > 0) {
      const distanceFromBottom = previous.height - previous.top;
      element.scrollTop = element.scrollHeight - distanceFromBottom;
    } else {
      const wasNearBottom =
        previous.height - previous.top - previous.clientHeight < 48;
      if (wasNearBottom) element.scrollTop = element.scrollHeight;
    }
    midi.current = {
      height: element.scrollHeight,
      top: element.scrollTop,
      clientHeight: element.clientHeight,
      topId,
      sessionId: snapshot.sessionId,
    };
  }, [messages, snapshot.sessionId, snapshot.generatingTool]);

  // Belege nur für die aktive, sichtbare Auswahl: Generation und Session
  // kommen aus dem Read-Weg, der Observer räumt bei jedem Wechsel ab.
  useHermesV2ReadObserver({
    containerRef: scrollRef,
    active,
    generation: readView?.generation ?? null,
    sessionId:
      readView?.sessionId === snapshot.sessionId ? snapshot.sessionId : null,
    onVisibleEvidence: (generation, handles) =>
      readView?.onVisibleEvidence(generation, handles) ?? Promise.resolve(),
  });

  // Zeilen und Gruppen als Elemente. Unveraenderte Zeilen behalten ihr
  // Element: React ueberspringt dann den ganzen Teilbaum.
  const rows = new Map<string, CachedRow>();
  const children = blocks.map((block) => {
    if (block.kind === "tools") {
      return (
        <HermesV2ToolGroup
          key={`tools:${block.id}`}
          entries={block.entries}
          reasoning={block.reasoning}
          durationMs={block.durationMs}
        />
      );
    }
    const id = block.message.id;
    const cached = rowCache.current.get(id);
    const entry =
      cached && cached.message === block.message
        ? cached
        : {
            message: block.message,
            element: <HermesV2MessageRow key={id} message={block.message} onGrow={followGrowth} />,
          };
    rows.set(id, entry);
    return entry.element;
  });
  rowCache.current = rows;

  return (
    <div
      ref={scrollRef}
      className="hermesv2-messages"
      role="log"
      aria-label="Chatverlauf"
    >
      {snapshot.hasOlder ? (
        <button
          type="button"
          className="hermesv2-history-link"
          disabled={snapshot.loadingOlder}
          onClick={onLoadOlder}
        >
          {snapshot.loadingOlder
            ? "Lade ältere Nachrichten…"
            : "Ältere Nachrichten laden"}
        </button>
      ) : null}
      {readView?.notices.map((notice) => (
        <article
          key={notice.id}
          className={`hermesv2-row is-notice${notice.kind === "unavailable-content" ? " is-unavailable" : ""}`}
          data-notice-kind={notice.kind}
        >
          <p className="hermesv2-row-text">{notice.text}</p>
          <footer className="hermesv2-row-meta">
            <span className="hermesv2-row-role">
              {noticeLabels[notice.kind] ?? "Hinweis"}
            </span>
          </footer>
          {notice.readEvidence ? (
            <span
              className="hermesv2-read-end"
              aria-hidden="true"
              data-read-evidence={notice.readEvidence}
            />
          ) : null}
        </article>
      ))}
      {children}
      {snapshot.queuedText && queuedInView ? (
        <div className="hermesv2-row is-user is-queued" role="status" aria-label="Nächste eingereihte Nachricht">
          <div className="hermesv2-row-text">{snapshot.queuedText}</div>
        </div>
      ) : null}
      {snapshot.loading ? (
        <p className="hermesv2-log-empty" role="status">
          Sitzung wird geladen…
        </p>
      ) : null}
      {!snapshot.loading &&
      messages.length === 0 &&
      !snapshot.queuedText &&
      !snapshot.generatingTool ? (
        <div className="hermesv2-chat-empty is-lead">
          <h2>Was möchtest du erledigen?</h2>
        </div>
      ) : null}
    </div>
  );
}
