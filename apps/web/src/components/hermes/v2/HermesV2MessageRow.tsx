import { memo } from "react";
import { hermesV2AttachmentIdSchema } from "@wrapt/contracts/hermes-v2";
import type { ChatMessageView } from "./chat-types";
import { CopyButton, MarkdownView, TextBlock } from "./HermesV2Markdown";
import { HermesV2Reasoning } from "./HermesV2Reasoning";
import { formatBytes } from "./HermesV2AttachmentChips";
import { formatClock, isToolOnly } from "./tool-group";

/** Belegprojektion kommt optional vom normalisierten Pfad; hier nur lesen. */
export type MessageRowMessage = ChatMessageView & {
  readEvidence?: string | null;
};

/**
 * Eine Zeile: Text (Markdown nur für Assistant) und Reasoning.
 * Die Rolle bleibt für Screenreader lesbar, steht aber nicht sichtbar über
 * dem Text - wie bei T3 Code trägt die Nachricht nur ihren Inhalt.
 * Werkzeugaufrufe gruppiert die Nachrichtenliste unterhalb der Zeile.
 */
function MessageRowBase({ message, onGrow }: { message: MessageRowMessage; onGrow?: (() => void) | undefined }) {
  const time = formatClock(message.timestamp);
  const isError = message.error !== null;
  // Nur vollständige Assistant-Antworten und Fehlerzeilen tragen einen
  // Beleg; Streaming/Interim/Toolfragmente und User-/Systemzeilen bestätigen nichts.
  const ackable =
    (message.status === "complete" && message.role === "assistant") || isError;
  const evidence = ackable ? (message.readEvidence ?? undefined) : undefined;
  if (isToolOnly(message)) return null;
  const role =
    message.role === "user"
      ? "Du"
      : message.role === "assistant"
        ? "Hermes"
        : message.role === "tool"
          ? "Werkzeug"
          : "Hinweis";
  return (
    <article
      className={`hermesv2-row is-${message.role}${isError ? " is-error" : ""}`}
      data-status={message.status}
    >
      <span className="sr-only">{role}</span>
      {message.reasoning !== null && message.reasoning !== "" ? (
        <HermesV2Reasoning
          text={message.reasoning}
          streaming={message.status === "streaming"}
        />
      ) : null}
      {/* Historydateikarten nur aus tatsächlich gelieferten Belegen; Download läuft
          ausschließlich über die opaque ID aus dem Vertrag, nie über Pfadheuristik. */}
      {message.role === "user" &&
      (message.attachments?.length ?? 0) > 0 &&
      message.rowId ? (
        <ul className="hermesv2-row-attach">
          {message.attachments!.map((attachment) =>
            hermesV2AttachmentIdSchema.safeParse(attachment.id).success ? (
              <li key={attachment.id} data-attachment-id={attachment.id}>
                <a
                  href={`/api/v1/hermes/v2/attachments/${attachment.id}`}
                  className="hermesv2-row-attach-link"
                >
                  {attachment.name}
                </a>
                <span className="hermesv2-row-attach-size">
                  {formatBytes(attachment.bytes)}
                </span>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
      {message.role === "tool" ? (
        <TextBlock text={message.text} />
      ) : message.role === "assistant" ? (
        <MarkdownView
          text={message.text}
          streaming={message.status === "streaming"}
          onGrow={onGrow}
        />
      ) : (
        <p className="hermesv2-row-text">{message.text}</p>
      )}
      {evidence ? (
        <span
          className="hermesv2-read-end"
          aria-hidden="true"
          data-read-evidence={evidence}
        />
      ) : null}
      {/* Eine Zeile ohne sichtbaren Text traegt nur die Gedanken. Dann gibt es
          weder etwas zu kopieren noch einen sichtbaren Inhalt zu zeiten.
          Fehler und Laufzustand bleiben trotzdem sichtbar. */}
      {message.text.trim().length > 0 || isError || message.status === "streaming" || message.status === "interim" ? (
        <footer className="hermesv2-row-meta">
          {message.status === "streaming" ? (
            <span className="hermesv2-row-status">
              schreibt… <span className="hermesv2-cursor" aria-hidden="true" />
            </span>
          ) : null}
          {message.status === "interim" ? (
            <span className="hermesv2-row-status">vorläufig</span>
          ) : null}
          {isError ? (
            <span className="hermesv2-row-status is-bad">{message.error}</span>
          ) : null}
          {message.text.trim().length > 0 ? (
            <>
              {time ? <time className="hermesv2-row-time">{time}</time> : null}
              <CopyButton text={message.text} label="Nachricht kopieren" />
            </>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

/** Memoisiert, damit Streamtokens unveränderte Zeilen nicht neu parsen. */
export const HermesV2MessageRow = memo(MessageRowBase);
