// Titelbearbeitung gegen die veröffentlichte setTitle-Action; klein und ehrlich.
import { useEffect, useRef, useState } from "react";
import { ModalFrame } from "../../ModalDialog";
import "./hermes-v2-dialogs.css";
import type { ChatComposerView } from "./chat-composer-types";
import type { ChatSessionView, HermesV2Chat } from "./chat-types";

export interface HermesV2TitleDialogProps {
  open: boolean;
  onClose: () => void;
  composer: ChatComposerView;
  disabled: boolean;
  disabledReason: string | null;
  /** Echter Titel beim Öffnen; während der Bearbeitung wird er nicht überschrieben. */
  initialTitle: string | null;
  setTitle: ((title: string) => void | Promise<void>) | null;
}

/** Fremde Titelpushes überschreiben die laufende Bearbeitung nicht. */
export function titleStatusNote(
  status: ChatComposerView["title"]["status"],
  fallback: string | null,
): string {
  return status === "pending"
    ? "Umbenennung läuft …"
    : status === "unconfirmed"
      ? "Vorgemerkt, noch nicht bestätigt."
      : status === "unknown"
        ? "Der Ausgang der Umbenennung ist unklar; bitte erneut prüfen."
        : status === "applied"
          ? "Der neue Titel ist belegt und erscheint in der Sitzungsspalte."
          : (fallback ?? "Der Titel erscheint in der Sitzungsspalte.");
}

/**
 * Grund, warum die Umbenennung gerade nicht möglich ist. Ohne belegte
 * Composerprojektion oder ohne die betroffene Sitzung bleibt der Dialog
 * sichtbar, aber gesperrt und mit Ursache.
 */
function renameBlockReason(
  chat: HermesV2Chat,
  snapshot: ChatSessionView | null,
): string | null {
  if (!chat.composer.settings) {
    return "Die Composerprojektion ist in dieser Fläche nicht verfügbar.";
  }
  if (chat.connection.state === "incompatible") {
    return "Die Hermes-Verbindung ist nicht kompatibel; bitte Verwaltung prüfen.";
  }
  if (chat.connection.state === "offline") return "Keine Verbindung zu Hermes.";
  if (!snapshot) return "Die Sitzung wird gerade geladen.";
  if (!snapshot.writable) {
    return snapshot.blockedReason ?? "Diese Sitzung nimmt derzeit keine Eingaben an.";
  }
  return null;
}

export interface HermesV2RenameDialogProps {
  chat: HermesV2Chat;
  /** Sitzung, die umbenannt werden soll. */
  sessionId: string;
  /** Bekannter Titel der Sitzung aus der Spalte. */
  title: string | null;
  onClose: () => void;
}

/**
 * Umbenennen aus der Sitzungsspalte: der Dialog braucht die Composerprojektion
 * und die betroffene Sitzung. Beide kommen aus dem Chatzustand.
 */
export function HermesV2RenameDialog({
  chat,
  sessionId,
  title,
  onClose,
}: HermesV2RenameDialogProps) {
  const snapshot =
    chat.activeSnapshot?.sessionId === sessionId ? chat.activeSnapshot : null;
  const reason = renameBlockReason(chat, snapshot);
  return (
    <HermesV2TitleDialog
      open
      onClose={onClose}
      composer={chat.composer}
      disabled={reason !== null}
      disabledReason={reason}
      initialTitle={title ?? snapshot?.session?.title ?? null}
      setTitle={(next) => chat.setTitle(next)}
    />
  );
}

export function HermesV2TitleDialog(props: HermesV2TitleDialogProps) {
  const {
    open,
    onClose,
    composer,
    disabled,
    disabledReason,
    initialTitle,
    setTitle,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [attemptActive, setAttemptActive] = useState(false);
  useEffect(() => {
    if (!open) return;
    // Aktueller Titel nur im Öffnungsrender fassen; fremde Titelupdates
    // überschreiben die laufende Bearbeitung nicht.
    setValue(initialTitle ?? "");
    // Alte appliedBeststände des Vorgängerversuchs schließen den neuen Dialog nicht.
    setAttemptActive(false);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
    // Absichtlich nur auf open: ein fremder Titelpush darf nicht zurücksetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    // Schließen nur, wenn ein aus diesem Dialog eigens gestarteter Versuch einen
    // belegten appliedÜbergang beobachtet; unconfirmed/unknown/pending bleiben offen.
    if (open && attemptActive && composer.title.status === "applied") {
      setAttemptActive(false);
      onClose();
    }
  }, [open, attemptActive, composer.title.status, onClose]);
  if (!open) return null;
  const pending = composer.title.status === "pending";
  const allowed = !disabled && !pending && Boolean(setTitle);
  return (
    <ModalFrame open onClose={onClose} title="Sitzung umbenennen">
      {(requestClose) => (
        <form
          className="hermesv2-new-session-form hermesv2-title-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!allowed) return;
            const next = value.trim();
            if (!next) return;
            // Viewerrors stehen im Statusmodell; hier bewusst nur auslösen.
            setAttemptActive(true);
            void Promise.resolve(setTitle!(next));
          }}
        >
          <label className="hermesv2-field">
            <span>Sitzungstitel</span>
            <input
              ref={inputRef}
              className="hermesv2-title-input"
              aria-label="Sitzungstitel"
              value={value}
              maxLength={200}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <div className="hermesv2-field">
            <p className="hermesv2-title-status" role="status">
              {titleStatusNote(composer.title.status, disabledReason)}
            </p>
          </div>
          <div className="hermesv2-form-actions">
            <button
              type="button"
              className="quiet-button"
              onClick={requestClose}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="quiet-button-primary"
              disabled={!allowed || !value.trim()}
            >
              Umbenennen
            </button>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}
