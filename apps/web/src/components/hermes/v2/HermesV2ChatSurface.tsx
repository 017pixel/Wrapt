import { useState } from "react";
import type { HermesV2Chat } from "./chat-types";
import type { HermesV2ReadView } from "./sidebar-types";
import { HermesV2Toast } from "./HermesV2Toast";
import { HermesV2ConnectionBanner } from "./HermesV2ConnectionBanner";
import { HermesV2ComposerArea } from "./HermesV2ComposerArea";
import "./hermes-v2-dialogs.css";
import { HermesV2MessageList } from "./HermesV2MessageList";
import { HermesV2RequestDeck } from "./HermesV2RequestDeck";
import { HermesV2WorkPanel } from "./HermesV2WorkPanel";
import {
  HermesV2SessionContext,
  sessionContextFields,
} from "./HermesV2SessionContext";
import "./hermes-v2-chat.css";

function UsageLine({
  usage,
}: {
  usage: NonNullable<HermesV2Chat["activeSnapshot"]>["usage"];
}) {
  if (!usage) return null;
  const parts = [
    `Eingabe ${usage.input.toLocaleString("de-DE")}`,
    `Ausgabe ${usage.output.toLocaleString("de-DE")}`,
    usage.contextMax
      ? `Kontext ${usage.contextUsed?.toLocaleString("de-DE") ?? "?"} von ${usage.contextMax.toLocaleString("de-DE")}`
      : null,
    usage.costUsd !== null
      ? `Kosten ${usage.costUsd.toLocaleString("de-DE", { style: "currency", currency: "USD" })}`
      : null,
  ].filter(Boolean);
  return <p className="hermesv2-usage">{parts.join(" · ")}</p>;
}

/** Verlorener Sendeausgang: klarer Hinweis plus ausdrücklicher Bewusst-Aktion. */
function UnknownSendCard({ chat }: { chat: HermesV2Chat }) {
  const unknown = chat.unknownSend;
  const [busy, setBusy] = useState(false);
  if (!unknown) return null;
  const resend = () => {
    setBusy(true);
    // Fehler liegen im Viewmodel (actionError); das Promise resolved immer.
    void chat
      .resendUnknown({ acknowledgeDuplicateRisk: true })
      .finally(() => setBusy(false));
  };
  return (
    <div className="hermesv2-unknown" role="alert">
      <p>{unknown.warning}</p>
      <p className="hermesv2-unknown-detail">
        {unknown.resynced
          ? "Abgleich ist abgeschlossen; der Ausgang bleibt unklar."
          : "Ein Abgleich mit der Sitzung ist noch nicht abgeschlossen."}
      </p>
      {!unknown.resynced ? (
        <button
          type="button"
          className="quiet-button"
          onClick={() => void chat.resync()}
        >
          Abgleichen
        </button>
      ) : null}
      {unknown.canResend && unknown.resynced ? (
        <button
          type="button"
          className="quiet-button modal-danger"
          disabled={busy}
          onClick={resend}
        >
          Bewusst erneut senden
        </button>
      ) : null}
      <button
        type="button"
        className="quiet-button"
        disabled={busy}
        onClick={() => void chat.continueWithoutResend()}
      >
        Ohne erneutes Senden fortfahren
      </button>
    </div>
  );
}

/**
 * Leerzustand nach T3-Vorbild: eine große Überschrift und eine ruhige
 * Unterzeile. Die Unterzeile ist ein Knopf und startet sofort eine Sitzung
 * ohne Projekt im laufenden Chat - ohne Dialog, ohne Seitenwechsel und ohne
 * Umweg über die Seitenleiste. Ein Projektname wird nur genannt, wenn er
 * belegt vorliegt; der Chatzustand kennt nur Projektkennungen, deshalb
 * bleibt der Bezug bei Hermes.
 */
function ChatEmptyState({
  onStartWithoutProject,
  busy,
}: {
  onStartWithoutProject: () => void;
  busy: boolean;
}) {
  return (
    <div className="hermesv2-chat-empty is-lead">
      <h2>Was möchten wir in Hermes bauen?</h2>
      <button
        type="button"
        className="hermesv2-chat-empty-start"
        onClick={onStartWithoutProject}
        disabled={busy}
        aria-busy={busy || undefined}
      >
        oder ohne Projekt beginnen
      </button>
    </div>
  );
}

export interface HermesV2ChatSurfaceProps {
  chat: HermesV2Chat;
  /** Geparkte Flächen behalten die Auswahl, verbinden aber ohne zusätzliche Arbeit. */
  active: boolean;
  variant: "route" | "panel" | "standalone";
  /** Öffnet den Neuen-Sitzung-Dialog der Shell; der Composer nutzt ihn für /new. */
  onNewSession: () => void;
  /** Optionale /resume-Hilfe: Shell öffnet Drawer oder Fokus der Sitzungssuche. */
  onOpenSessions?: () => void;
  /** Optionale Belege und historische Hinweise der Sidebar-Organisation. */
  readView?: HermesV2ReadView | undefined;
  /** Eigener Read-Aktivitätswert: ein mobiles Drawer-Overlay darf nicht lesen. */
  readActive?: boolean | undefined;
}

/** Die eigentliche Chatfläche: Auswahl, Stream, Composer, Requests, Fehler. */
export function HermesV2ChatSurface({
  chat,
  variant,
  onNewSession,
  onOpenSessions,
  active,
  readActive = active,
  readView,
}: HermesV2ChatSurfaceProps) {
  const snapshot = chat.activeSnapshot;
  const sessionId = snapshot?.sessionId ?? null;
  const composerDisabled =
    chat.connection.state === "offline" ||
    chat.connection.state === "incompatible";
  // Der native Queuekopf sperrt Composer und normale Sendeaktionen nicht; mehrere
  // Einreihungen oder Steuerungen bleiben zulässig.
  const composerReason =
    snapshot && !snapshot.writable
      ? (snapshot.blockedReason ??
        "Diese Sitzung nimmt derzeit keine Eingaben an.")
      : composerDisabled
        ? chat.connection.state === "incompatible"
          ? "Die Hermes-Verbindung ist nicht kompatibel; bitte Verwaltung prüfen."
          : "Keine Verbindung zu Hermes."
        : !sessionId
          ? "Wähle links eine Sitzung oder beginne eine neue."
          : null;

  // Model-/Title-/Help-Dialoge verdecken Requests und Leseprojektionen;
  // Secretfelder sind dadurch sofort leer und gesperrt.
  const [overlayActive, setOverlayActive] = useState(false);
  // Der Leerzustand startet eine Sitzung ohne Projekt direkt im laufenden Chat.
  const [starting, setStarting] = useState(false);
  const readEffective = active && readActive && !overlayActive;
  // Genau ein sichtbarer Queuekopf: der Verlauf zeigt ihn immer; die Aufgabenansicht
  // überdrückt ihn nie und meldet nur belegte oder unbekannte Zustände.
  const queuedShown = Boolean(snapshot?.queuedText);
  // Die Sitzungsdetails stehen in der oberen rechten Ecke. Ohne belegte
  // Angabe gibt es nichts zu zeigen, dann entfaellt die Ecke ganz.
  const contextFields = sessionContextFields(snapshot);
  const detailsShown =
    Boolean(snapshot) &&
    (contextFields.length > 0 || Boolean(snapshot?.usage));

  const startWithoutProject = () => {
    if (starting) return;
    setStarting(true);
    // Der Lauf meldet einen Fehler ueber die Aktionsfehlerzeile der Flaeche.
    void chat
      .createSession({ projectId: null })
      .catch(() => undefined)
      .finally(() => setStarting(false));
  };

  return (
    <div className="hermesv2-chat-body" data-variant={variant}>
      <HermesV2ConnectionBanner
        active={active}
        connection={chat.connection}
        onReconnect={chat.reconnect}
      />
      {active && snapshot && !snapshot.writable && snapshot.blockedReason !== snapshot.error?.message ? (
        <HermesV2Toast key={`${sessionId}:readonly:${snapshot.blockedReason}`} tone="warning"
          message={snapshot.blockedReason ?? "Nur lesender Zugriff auf diese Sitzung."} />
      ) : null}
      {snapshot ? (
        <HermesV2RequestDeck
          chat={chat}
          snapshot={snapshot}
          interactive={readEffective}
        />
      ) : null}
      {snapshot && detailsShown ? (
        <div className="hermesv2-chat-corner">
          <details key={snapshot.sessionId} className="hermesv2-chat-details">
            <summary>Sitzungsdetails</summary>
            <div className="hermesv2-chat-details-body">
              <HermesV2SessionContext snapshot={snapshot} />
              <UsageLine usage={snapshot.usage} />
            </div>
          </details>
        </div>
      ) : null}
      {active && snapshot?.error ? (
        <HermesV2Toast key={`${sessionId}:snapshot:${snapshot.error.message}`} message={snapshot.error.message}>
          <button type="button" className="quiet-button" onClick={() => void chat.resync()}>Erneut abgleichen</button>
        </HermesV2Toast>
      ) : null}
      {snapshot ? <UnknownSendCard chat={chat} /> : null}
      {active && chat.actionError && chat.actionError.message !== snapshot?.error?.message
        && chat.actionError.message !== snapshot?.blockedReason
        && chat.actionError.message !== snapshot?.catalog.error?.message ? (
        <HermesV2Toast key={`${sessionId}:action:${chat.actionError.message}`} message={chat.actionError.message} onDismiss={chat.clearError} />
      ) : null}
      {snapshot ? (
        <HermesV2MessageList
          snapshot={snapshot}
          onLoadOlder={() => void chat.loadOlder()}
          active={readEffective}
          readView={readView}
        />
      ) : (
        <ChatEmptyState
          onStartWithoutProject={startWithoutProject}
          busy={starting}
        />
      )}
      {snapshot ? (
        <HermesV2WorkPanel chat={chat} queuedShown={queuedShown} active={readEffective}
          errorVisible={![snapshot.error?.message, snapshot.blockedReason, snapshot.catalog.error?.message, chat.actionError?.message].includes(chat.work.error?.message)} />
      ) : null}
      {active && snapshot?.catalog.error && snapshot.catalog.error.message !== snapshot.blockedReason
        && snapshot.catalog.error.message !== snapshot.error?.message ? (
        <HermesV2Toast key={`${sessionId}:catalog:${snapshot.catalog.error.message}`} message={snapshot.catalog.error.message}>
          <button type="button" className="quiet-button" onClick={() => void chat.readCatalog()}>Katalog aktualisieren</button>
        </HermesV2Toast>
      ) : null}
      {snapshot ? <HermesV2ComposerArea
        chat={chat}
        snapshot={snapshot}
        value={sessionId ? chat.draft : ""}
        onSubmit={() => {
          return chat.submit();
        }}
        onNewSession={onNewSession}
        onOpenSessions={onOpenSessions}
        onOverlayActive={setOverlayActive}
        active={active}
        running={snapshot?.running === true}
        disabled={
          composerDisabled ||
          !sessionId ||
          (snapshot !== null && !snapshot.writable)
        }
        disabledReason={composerReason}
        submitting={chat.submitting}
      /> : null}
    </div>
  );
}
