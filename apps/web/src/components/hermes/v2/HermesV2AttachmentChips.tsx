// Anhänge: echtes fileInput und Drop, sequenzielle Uploads, opaque IDs.
// Knopf und Chipliste sind getrennt: der Knopf sitzt in der Werkzeugleiste,
// die Liste darüber.
import { useRef } from "react";
import { CloseIcon, PlusIcon } from "../../icons";
import type { ChatAttachmentView } from "./chat-composer-types";

export const HERMES_V2_ATTACHMENT_MAX_BYTES = 4_194_304;
export const HERMES_V2_ATTACHMENT_LIMIT = 10;

export interface HermesV2AttachmentActions {
  uploadAttachment: ((file: File) => void | Promise<void>) | null;
  removeAttachment: ((uploadId: string) => void) | null;
  checkUpload: ((uploadId: string) => void | Promise<void>) | null;
}

/** Beim ersten Pick erfassbare Batch-Gerade: Wechsel/Verbergen/Unmount bricht ab. */
export interface AttachmentBatchGuard {
  /** Vor jedem weiteren File geprüft, nicht nur innerhalb eines uploadAttachment-Aufrufs. */
  continues: () => boolean;
  /** Wird bei erkanntem Abbruch aufgerufen; ein Status wird sichtbar. */
  abort: () => void;
}

export interface HermesV2AttachButtonProps {
  attachments: readonly ChatAttachmentView[];
  actions: HermesV2AttachmentActions;
  disabled: boolean;
  disabledReason: string | null;
  /** Der Orchestrator fängt Generations-/Slot-Gerade und lädt sequenziell. */
  onPickFiles: (files: readonly File[], oversizeSkipped: number) => void;
}

export interface HermesV2AttachmentChipsProps {
  attachments: readonly ChatAttachmentView[];
  actions: HermesV2AttachmentActions;
  disabled: boolean;
  /** Lokale Statusnotiz der letzten Auswahl. */
  note: string | null;
}

/** Begrenzt die Auswahl auf den freien Platz und zählt übersprungene Dateien. */
export function splitAttachmentLimit(
  picked: readonly File[],
  attachmentCount: number,
): { files: readonly File[]; skipped: number } {
  const remaining = Math.max(0, HERMES_V2_ATTACHMENT_LIMIT - attachmentCount);
  return {
    files: picked.slice(0, remaining),
    skipped: picked.length < remaining ? 0 : picked.length - remaining,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576)
    return `${(bytes / 1_048_576).toFixed(bytes % 1_048_576 === 0 ? 0 : 1)} MiB`;
  return `${bytes} B`;
}

/**
 * Mehrfachauswahl wird nacheinander hochgeladen: nur ein laufender Upload je
 * Principal ist erlaubt. 4 MiB werden vor dem Upload sichtbar abgewiesen;
 * Viewerrors stehen pro Chip, kein automatischer Re-Versuch.
 */
export async function gatherAttachmentFiles(
  picked: readonly File[],
  actions: HermesV2AttachmentActions,
  guard: AttachmentBatchGuard,
  onNote: (note: string | null) => void,
): Promise<void> {
  if (!actions.uploadAttachment) {
    onNote("Anhänge sind in dieser Fläche nicht verfügbar.");
    return;
  }
  const oversized: string[] = [];
  const empty: string[] = [];
  for (const file of picked) {
    if (!guard.continues()) {
      guard.abort();
      return;
    }
    if (file.size > HERMES_V2_ATTACHMENT_MAX_BYTES) {
      oversized.push(file.name);
      continue;
    }
    if (file.size < 1) {
      empty.push(file.name);
      continue;
    }
    await actions.uploadAttachment(file);
    // Nach jedem Upload erneut prüfen: Wechsel/Verbergen/Unmount bricht den
    // Rest ab, damit niemals der folgwende besitzfremde Ursprung laden kann.
    if (!guard.continues()) {
      guard.abort();
      return;
    }
  }
  if (oversized.length > 0) {
    onNote(
      `Nicht übernommen: ${oversized.join(", ")} über ${formatBytes(HERMES_V2_ATTACHMENT_MAX_BYTES)}.`,
    );
  } else if (empty.length > 0) {
    onNote(`Nicht übernommen: ${empty.join(", ")} ist leer.`);
  } else {
    onNote(null);
  }
}

/** Der Anhangknopf der Werkzeugleiste; er öffnet das echte Dateiauswahlfeld. */
export function HermesV2AttachButton(props: HermesV2AttachButtonProps) {
  const {
    attachments,
    actions,
    disabled,
    disabledReason,
    onPickFiles,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const limitReached = attachments.length >= HERMES_V2_ATTACHMENT_LIMIT;
  const blocked = disabled || !actions.uploadAttachment || limitReached;
  const blockTitle = limitReached
    ? "Maximal 10 Anhänge pro Nachricht."
    : (disabledReason ?? "Anhänge derzeit nicht möglich.");
  return (
    <div className="hermesv2-attach">
      <button
        type="button"
        className="quiet-button hermesv2-chip hermesv2-attach-button"
        aria-label="Datei anhängen"
        disabled={blocked}
        title={blocked ? blockTitle : "Datei anhängen"}
        onClick={() => {
          if (!blocked) inputRef.current?.click();
        }}
      >
        <PlusIcon aria-hidden style={{ color: "currentColor" }} />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        aria-label="Dateien für Hermes auswählen"
        className="hermesv2-attach-input"
        disabled={blocked}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          event.target.value = "";
          const { files, skipped } = splitAttachmentLimit(
            picked,
            attachments.length,
          );
          onPickFiles(files, skipped);
        }}
      />
    </div>
  );
}

/** Die angehängten Dateien als schmale Chips über der Werkzeugleiste. */
export function HermesV2AttachmentChips(props: HermesV2AttachmentChipsProps) {
  const { attachments, actions, disabled, note } = props;
  if (attachments.length === 0 && !note) return null;
  return (
    <div className="hermesv2-attach-list-wrap">
      {attachments.length > 0 ? (
        <ul className="hermesv2-attach-list">
          {attachments.map((attachment) => (
            <Chip
              key={attachment.uploadId}
              attachment={attachment}
              actions={actions}
              disabled={disabled}
            />
          ))}
        </ul>
      ) : null}
      {note ? (
        <p className="hermesv2-attach-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}

const STATUS_LABEL: Record<ChatAttachmentView["status"], string> = {
  uploading: "lädt hoch",
  receiving: "in Empfang",
  ready: "bereit",
  unknown: "Ausgang unklar",
  not_sent: "nicht übermittelt",
  expired: "abgelaufen",
};

function Chip({
  attachment,
  actions,
  disabled,
}: {
  attachment: ChatAttachmentView;
  actions: HermesV2AttachmentActions;
  disabled: boolean;
}) {
  const status = STATUS_LABEL[attachment.status];
  return (
    <li
      className="hermesv2-attach-chip"
      data-upload-id={attachment.uploadId}
      data-upload-status={attachment.status}
      title={`${attachment.name} · ${formatBytes(attachment.bytes)} · ${status}`}
    >
      <span className="hermesv2-attach-name">{attachment.name}</span>
      <span className="hermesv2-attach-meta">{status}</span>
      {attachment.status === "unknown" && actions.checkUpload ? (
        <button
          type="button"
          className="quiet-button hermesv2-attach-action"
          disabled={disabled}
          title="Übertragungsstatus prüfen"
          onClick={() =>
            void Promise.resolve(actions.checkUpload!(attachment.uploadId))
          }
        >
          Status prüfen
        </button>
      ) : null}
      {attachment.error ? (
        <span className="hermesv2-attach-error" role="alert">
          {attachment.error.message}
        </span>
      ) : null}
      {actions.removeAttachment ? (
        <button
          type="button"
          className="quiet-button hermesv2-attach-remove"
          disabled={disabled}
          aria-label={`Anhang ${attachment.name} entfernen`}
          title="Anhang entfernen"
          onClick={() => actions.removeAttachment?.(attachment.uploadId)}
        >
          <CloseIcon aria-hidden style={{ color: "currentColor" }} />
        </button>
      ) : null}
    </li>
  );
}
