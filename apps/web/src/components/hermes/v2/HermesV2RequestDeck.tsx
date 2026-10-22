import { useMemo, useRef } from "react";
import { Link } from "react-router";
import type {
  ChatSessionView,
  HermesV2Chat,
  HermesV2Request,
  HermesV2Response,
} from "./chat-types";
import {
  findRequestState,
  requestBlock,
  requestEpochId,
  type HermesV2RequestCardProps,
} from "./request-cards";
import { HermesV2ApprovalCard } from "./HermesV2ApprovalCard";
import { HermesV2ClarifyCard } from "./HermesV2ClarifyCard";
import { HermesV2SecretCard } from "./HermesV2SecretCard";
import { HermesV2SetupCard } from "./HermesV2SetupCard";
import { hermesV2ClassicHref } from "../../../lib/hermesV2Routes";
import "./hermes-v2-requests.css";

export interface HermesV2RequestDeckProps {
  chat: HermesV2Chat;
  snapshot: ChatSessionView;
  /** active && readActive: verdeckte Flächen senden nichts und leeren Secrets. */
  interactive: boolean;
}

/** Reihenfolge createdAt, dann key; stabile Keys aus Session-ID, Epoche und Requestkey. */
function orderRequests(
  requests: readonly HermesV2Request[],
): readonly HermesV2Request[] {
  return [...requests].sort(
    (a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key),
  );
}

/**
 * Native Eingabekarten für offene Server-Requests. Jede Anfrage besitzt eine
 * synchrone lokale Klicksperre zusätzlich zum gemeinsamen Requeststatus;
 * unbekannter Ausgang sperrt die Karte und bietet Abgleich plus Classic.
 */
export function HermesV2RequestDeck({
  chat,
  snapshot,
  interactive,
}: HermesV2RequestDeckProps) {
  const requests = orderRequests(snapshot.requests);
  const busyKeys = useRef(new Set<string>());
  const unknownRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          findRequestState(chat.requestStates, request)?.status === "unknown",
      ),
    [requests, chat.requestStates],
  );

  const handlers = (
    request: HermesV2Request,
  ): Omit<HermesV2RequestCardProps, "request"> => {
    const id = requestEpochId(request);
    const { blocked, reason } = requestBlock({
      interactive,
      connectionState: chat.connection.state,
      writable: snapshot.writable,
      requestState: findRequestState(chat.requestStates, request),
    });
    const start = (action: () => unknown) => {
      if (blocked || busyKeys.current.has(id)) return; // synchrone Klicksperre
      busyKeys.current.add(id);
      const settled = () => busyKeys.current.delete(id);
      try {
        const result = action();
        if (result instanceof Promise) void result.then(settled, settled);
        else settled();
      } catch {
        settled(); // Fehler stehen im Viewmodel; lokale Sperre löst sich immer.
      }
    };
    return {
      blocked,
      blockedReason: reason,
      onRespond: (response: HermesV2Response) =>
        start(() => chat.respond(request, response)),
      onLock: (questionId: string, answer: string | null) =>
        start(() => chat.lockRequest(request, questionId, answer)),
    };
  };

  if (requests.length === 0) return null;
  const bind = handlers;

  return (
    <section
      className="hermesv2-request-deck"
      aria-label="Offene Anfragen von Hermes"
    >
      <div className="hermesv2-request-deck-list">
        {requests.map((request) => (
          <div
            key={JSON.stringify([
              request.sessionId,
              request.epoch,
              request.key,
            ])}
            data-hermes-request-key={request.key}
            data-request-kind={request.kind}
          >
            {request.kind === "approval" ? (
              <HermesV2ApprovalCard request={request} {...bind(request)} />
            ) : request.kind === "clarify" ? (
              <HermesV2ClarifyCard request={request} {...bind(request)} />
            ) : request.kind === "secret" ? (
              <HermesV2SecretCard request={request} {...bind(request)} />
            ) : (
              <HermesV2SetupCard request={request} {...bind(request)} />
            )}
          </div>
        ))}
      </div>
      <footer className="hermesv2-request-deck-foot">
        {unknownRequests.length > 0 ? (
          <p role="status">
            Bei {unknownRequests.length} Anfrage
            {unknownRequests.length === 1 ? "" : "n"} ist der Ausgang unklar.
            <button
              type="button"
              className="quiet-button"
              onClick={() => void chat.resync()}
            >
              Abgleichen
            </button>
          </p>
        ) : null}
        <p className="hermesv2-request-deck-classic">
          <Link
            to={hermesV2ClassicHref(snapshot.sessionId)}
            className="hermesv2-request-link"
          >
            Klassische Hermes-Oberfläche öffnen
          </Link>
        </p>
      </footer>
    </section>
  );
}
