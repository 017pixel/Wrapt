// Composergebiet: Eingabefeld, Slashpalette, Chips und Aktionen an der echten Chatfläche.
import { useEffect, useId, useMemo, useState } from "react";
import type { HermesV2Effort } from "@wrapt/contracts/hermes-v2";
import { ContentDialog } from "../../ModalDialog";
import { Link } from "react-router";
import { hermesV2ClassicHref } from "../../../lib/hermesV2Routes";
import { resolveChatCommand } from "./chat-commands";
import { splitAttachmentLimit } from "./HermesV2AttachmentChips";
import {
  filterSlashCommands,
  restHead,
  splitSlashDraft,
  slashHint,
  type SlashEntry,
} from "./composer-slash";
import { HermesV2Composer } from "./HermesV2Composer";
import { HermesV2ComposerToolbar } from "./HermesV2ComposerToolbar";
import { HermesV2ModelPicker } from "./HermesV2ModelPicker";
import { HermesV2SlashPalette } from "./HermesV2SlashPalette";
import { HermesV2WorkSendActions } from "./HermesV2WorkSendActions";
import {
  HermesV2AttachButton,
  HermesV2AttachmentChips,
} from "./HermesV2AttachmentChips";
import { useCatalogLoader } from "./useCatalogLoader";import { useComposerAttachments } from "./useComposerAttachments";
import type { ChatSessionView, HermesV2Chat } from "./chat-types";
import "./hermes-v2-composer.css";
import "./hermes-v2-input.css";

export interface HermesV2ComposerAreaProps {
  chat: HermesV2Chat;
  snapshot: ChatSessionView | null;
  value: string;
  disabled: boolean;
  disabledReason: string | null;
  running: boolean;
  submitting: boolean;
  onSubmit: () => void | Promise<void>;
  onNewSession: () => void;
  /** Aktivität der Fläche: geparkte Flächen laden/passiv nichts nach. */
  active: boolean;
  /** Optionalprop für /resume: Shell öffnet mobil Drawer oder Desktop-Suchfokus. */
  onOpenSessions?: (() => void) | undefined;
  /** Model-/Help-Dialoge verdecken Requestkarten und Leseprojektionen. */
  onOverlayActive?: ((active: boolean) => void) | undefined;
}

const HELP_LIMIT = 100;
/** Hinweise an die Nutzerin: Text und ob die klassische Fläche hilft. */
interface ComposerNotice {
  text: string;
  classic: boolean;
}

export function HermesV2ComposerArea(props: HermesV2ComposerAreaProps) {
  const {
    chat,
    snapshot,
    value,
    disabled,
    disabledReason,
    running,
    submitting,
    active,
    onSubmit,
    onNewSession,
    onOpenSessions,
    onOverlayActive,
  } = props;
  const composer = chat.composer;
  const commands = snapshot?.catalog.commands ?? [];
  const slash = splitSlashDraft(value);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [notice, setNotice] = useState<ComposerNotice | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [attachDragging, setAttachDragging] = useState(false);

  // Die Palette öffnet ausschließlich ein Slash-Draft; ein Knopf dafür fehlt.
  const paletteVisible = slash.startsSlash && dismissedAt !== value;
  // Panels parallel: eindeutige useId-Liste gemeinsam mit der Textarea.
  const listId = `hermesv2-slash-${useId()}`;
  const head = restHead(slash.rest).head;
  const filtered = useMemo(
    () => filterSlashCommands(commands, head),
    // Kopf dieses Drafts geht direkt aus value hervor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commands, value],
  );
  const safeIndex =
    filtered.length > 0
      ? Math.min(Math.max(activeIndex, 0), filtered.length - 1)
      : 0;
  const activeOptionId =
    paletteVisible && filtered.length > 0
      ? `${listId}-option-${safeIndex}`
      : null;
  const overlayOpen = modelOpen || helpOpen;

  useEffect(() => {
    setNotice(null);
  }, [value]);
  useEffect(() => {
    setActiveIndex(0);
  }, [value, commands.length]);
  // Dialoge gehören zur aktuellen Sitzung; nach Wechsel öffnet nichts.
  useCatalogLoader(chat, snapshot, active);
  const composerAttachments = useComposerAttachments(
    chat,
    snapshot,
    disabled,
    active,
  );
  const {
    attachActions,
    attachNote,
    onAttachNote: setAttachNote,
    startAttachmentBatch,
    attachAvailable,
    attachDisabledReason,
  } = composerAttachments;

  useEffect(() => {
    setModelOpen(false);
    setHelpOpen(false);
    setAttachNote(null);
  }, [snapshot?.sessionId, setAttachNote]);
  useEffect(() => {
    onOverlayActive?.(overlayOpen);
  }, [overlayOpen, onOverlayActive]);

  const applySlashPick = (entry: SlashEntry) => {
    // Eine echte Slashzeile kennt ihr Argument; der erfasste Rest bleibt
    // sichtbar im Composer, statt heimlich als Nachricht zu senden.
    const slashArgument = restHead(slash.rest).argument;
    const commandArgument = slashArgument ?? value.trim();
    const intent = resolveChatCommand(commands, entry.command.key, commandArgument);
    setDismissedAt(null);
    if (intent.kind === "unsupported") {
      // Die gewählte Handlung ist sichtbar nicht ausgeführt, mit Grund und Classic-Hinweis.
      setNotice({
        text: `${entry.command.key}: ${intent.reason}`,
        classic: true,
      });
      return;
    }
    if (intent.kind === "draft") {
      // Der erfasste Text wird als Aufgabe in die Agentanweisung übernommen;
      // nichts sendet sich heimlich, und ein reiner Slashentwurf wie vorher.
      chat.setDraft(intent.text);
      return;
    }
    // Die gewählte Handlung ersetzt die Slashzeile; ein erfasster Rest bleibt
    // als Argument im Composer sichtbar, statt heimlich als Nachricht zu senden.
    if (intent.action === "new") onNewSession();
    else if (intent.action === "resume") {
      if (onOpenSessions) onOpenSessions();
      else
        setNotice({
          text: "/resume: In dieser Fläche ist keine Sitzungsauswahl geöffnet.",
          classic: false,
        });
    } else if (intent.action === "stop") void chat.stop();
    else if (intent.action === "model") setModelOpen(true);
    else if (intent.action === "help") setHelpOpen(true);
    else if (intent.action === "queue") {
      // Argumente landen bewusst im Sendefeld; erst die Aktion reiht ein.
      if (slashArgument !== null) chat.setDraft(slashArgument);
      setNotice({
        text: 'Einreihen: Der Text steht im Sendefeld. Aktion "Einreihen" im Überlaufmenü.',
        classic: false,
      });
      return;
    } else if (intent.action === "steer") {
      if (slashArgument !== null) chat.setDraft(slashArgument);
      setNotice({
        text: 'Steuern: Der Text steht im Sendefeld. Aktion "Steuern" im Überlaufmenü.',
        classic: false,
      });
      return;
    } else if (intent.action === "title") {
      // Umbenennen liegt jetzt im Sitzungsmenü der Seitenleiste.
      setNotice({
        text: "Umbenennen: im Sitzungsmenü der Seitenleiste.",
        classic: false,
      });
    }
    if (slashArgument !== null) chat.setDraft(slashArgument);
  };

  const paletteKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
  ): boolean => {
    if (!paletteVisible) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(safeIndex + 1);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(safeIndex - 1, 0));
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (slash.startsSlash) setDismissedAt(value);
      return true;
    }
    if (event.key === "Enter") {
      if (filtered.length === 0) return false;
      event.preventDefault();
      const entry = filtered[safeIndex];
      if (entry) applySlashPick(entry);
      return true;
    }
    return false;
  };

  const hasUnknown = composer.attachments.some(
    (attachment) => attachment.status === "unknown",
  );
  const sendSlashBlockedReason =
    slash.startsSlash && value.trim().length > 0
      ? "Slash-Befehl: Auswahl in der Palette treffen, nicht als Nachricht senden."
      : null;
  const unknownBlockedReason = hasUnknown
    ? "Unklarer Anhang: Kläre den Status, bevor du sendest."
    : null;
  const sendBlockedReason = sendSlashBlockedReason ?? unknownBlockedReason;
  const readyCount = composer.attachments.filter(
    (attachment) => attachment.status === "ready",
  ).length;

  return (
    <div
      className="hermesv2-composer-area"
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing
        )
          paletteKeyDown(event);
      }}
    >
      <div
        className="hermesv2-composer-wrap"
        data-dragging={attachDragging || undefined}
        onDragOver={(event) => {
          // Textdrops bleiben unberührt; nur echte Dateidrops werden von der
          // Composerzone angenommen.
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setAttachDragging(true);
        }}
        onDragLeave={() => setAttachDragging(false)}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setAttachDragging(false);
          const picked = Array.from(event.dataTransfer.files);
          const { files, skipped }
            = splitAttachmentLimit(picked, composer.attachments.length);
          startAttachmentBatch(files, skipped);
        }}
      >
        <HermesV2SlashPalette
          open={paletteVisible}
          entries={filtered}
          listId={listId}
          activeIndex={safeIndex}
          onActiveIndex={setActiveIndex}
          onPick={applySlashPick}
          onDismiss={() => {
            if (slash.startsSlash) setDismissedAt(value);
          }}
        />
        <HermesV2Composer
          value={value}
          onChange={(text) => {
            setDismissedAt(null);
            chat.setDraft(text);
          }}
          onSubmit={onSubmit}
          onStop={() => void chat.stop()}
          running={running}
          disabled={disabled}
          disabledReason={disabledReason}
          submitting={submitting}
          sendBlockedReason={sendBlockedReason}
          allowEmptySubmit={readyCount > 0}
          paletteKeyDown={paletteKeyDown}
          listId={paletteVisible ? listId : null}
          activeOptionId={activeOptionId}
          chips={
            composer.available && snapshot ? (
              <>
                <HermesV2AttachmentChips
                  attachments={composer.attachments}
                  actions={attachActions}
                  disabled={!attachAvailable}
                  note={attachNote}
                />
                <HermesV2ComposerToolbar
                  composer={composer}
                  catalog={snapshot.catalog}
                  snapshot={snapshot}
                  onModelPicker={setModelOpen}
                  onSelectReasoning={(effort: HermesV2Effort) =>
                    chat.selectReasoning(effort)
                  }
                  onApprovalMode={(mode) => chat.setApprovalMode(mode)}
                />
              </>
            ) : null
          }
          tools={
            <>
              {composer.available && snapshot ? (
                <HermesV2AttachButton
                  attachments={composer.attachments}
                  actions={attachActions}
                  disabled={!attachAvailable}
                  disabledReason={attachDisabledReason}
                  onPickFiles={startAttachmentBatch}
                />
              ) : null}
              {snapshot ? (
                <HermesV2WorkSendActions
                  chat={chat}
                  value={value}
                  snapshot={snapshot}
                  running={running}
                />
              ) : null}
            </>
          }
        />
      </div>
      {notice ? (
        <p className="hermesv2-slash-notice" role="status">
          {notice.text}{" "}
          {notice.classic && snapshot ? (
            <Link to={hermesV2ClassicHref(snapshot.sessionId)}>
              Klassische Hermes-Oberfläche öffnen
            </Link>
          ) : null}
        </p>
      ) : null}
      <HermesV2ModelPicker
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        catalog={snapshot?.catalog.models ?? null}
        composer={composer}
        sessionId={snapshot?.sessionId ?? null}
        observedSelection={snapshot?.selection ?? null}
        onSelect={(selection, confirmed) =>
          chat.selectModel(selection, confirmed)
        }
        onCancel={() => chat.cancelModelSelection()}
      />
      {helpOpen ? (
        <ContentDialog
          open
          title="Hilfe: Hermes-Befehle"
          onClose={() => setHelpOpen(false)}
        >
          <ul className="hermesv2-help-list">
            {commands.slice(0, HELP_LIMIT).map((command) => (
              <li key={command.key} data-slash-key={command.key}>
                <code>{command.key}</code> {command.label}
                <span className="hermesv2-help-detail">
                  {command.description}
                  {slashHint(command) ? ` · ${slashHint(command)}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {commands.length > HELP_LIMIT ? (
            <p role="note">
              Die Palette kennt den vollständigen Katalog ({commands.length}) …
              begrenzt.
            </p>
          ) : null}
        </ContentDialog>
      ) : null}
    </div>
  );
}
