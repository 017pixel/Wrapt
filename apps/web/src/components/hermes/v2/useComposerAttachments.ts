// Attachments-Batchgerade: Generationsentwertung, Slots, sequenzielle Uploads.
import { useEffect, useRef, useState } from "react";
import {
  gatherAttachmentFiles,
  HERMES_V2_ATTACHMENT_LIMIT,
  type HermesV2AttachmentActions,
} from "./HermesV2AttachmentChips";
import type { ChatSessionView, HermesV2Chat } from "./chat-types";

const composerSlot = (snapshot: ChatSessionView | null): string | null =>
  snapshot ? `${snapshot.sessionId}@${snapshot.epoch}` : null;

export interface ComposerAttachmentBatch {
  attachActions: HermesV2AttachmentActions;
  attachAvailable: boolean;
  attachDisabledReason: string | null;
  attachNote: string | null;
  onAttachNote: (note: string | null) => void;
  startAttachmentBatch: (files: readonly File[], oversizeSkipped: number) => void;
}

/**
 * Batchgerade: Unmount, Verbergen, Parken und beobachtete Slotwechsel
 * entwerten laufende Uploads (auch A→B→A). Der Slot wird beim ersten Pick
 * gefasst und nach jedem Upload erneut verglichen; niemals Paralleluploads.
 */
export function useComposerAttachments(
  chat: HermesV2Chat,
  snapshot: ChatSessionView | null,
  disabled: boolean,
  active: boolean,
): ComposerAttachmentBatch {
  const composer = chat.composer;
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const aliveRef = useRef(true);
  // Generationszähler: picks, beobachtete Slotwechsel und Verborgenheit
  // entwerten den Batch, statt nur aktuelle Gleichheit zu prüfen.
  const generationRef = useRef(0);
  // Notizepoch: wird nur beim echten Batchstart neu gesetzt, damit alte
  // zurückgehaltene Uploads die Notiz neuerer Batches nicht mehr ändern.
  const epochRef = useRef(0);
  const slotRef = useRef<string | null>(composerSlot(snapshot));
  const lastSlotRef = useRef<string | null>(slotRef.current);
  slotRef.current = composerSlot(snapshot);
  useEffect(() => {
    const observed = composerSlot(snapshot);
    if (observed !== lastSlotRef.current) {
      lastSlotRef.current = observed;
      slotRef.current = observed;
      generationRef.current += 1;
    }
  }, [snapshot]);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) generationRef.current += 1;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
  // StrictMode-Sicherheit: Setup setzt alive true, Cleanup lässt false zurück.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  // Parken entwertet laufende Uploadbatches ebenfalls.
  useEffect(() => {
    if (!active) generationRef.current += 1;
  }, [active]);

  const attachAvailable =
    composer.available && snapshot?.writable === true && !disabled;
  const attachActions: HermesV2AttachmentActions = {
    uploadAttachment: attachAvailable
      ? (file) => chat.uploadAttachment(file)
      : null,
    removeAttachment: composer.available
      ? (uploadId) => chat.removeAttachment(uploadId)
      : null,
    checkUpload: attachAvailable
      ? (uploadId) => chat.checkUpload(uploadId)
      : null,
  };
  const startAttachmentBatch = (files: readonly File[], oversizeSkipped: number) => {
    if (files.length === 0 && oversizeSkipped === 0) return;
    generationRef.current += 1;
    const generation = generationRef.current;
    // Die Notizepoch gehört zum Batchstart: Slots, Verbergen und Parken
    // entwerten die Uploads, aber ein zurückgehaltener Upload des laufenden
    // Batches nach einem Neustart darf die Notiz des Neubatches nicht
    // überschreiben. Nur ein echter Batchstart selbst stumpft die Epoch.
    const noteEpoch = generation;
    epochRef.current = noteEpoch;
    const noteAllowed = () =>
      aliveRef.current && epochRef.current === noteEpoch;
    // Die Notiz gehört zum Batchstart: übersprungene bleiben sichtbar,
    // ein frischer Batch ohne Überspringen räumt die alte Notiz ab.
    setAttachNote(oversizeSkipped > 0
      ? `Maximal ${HERMES_V2_ATTACHMENT_LIMIT} Anhänge pro Nachricht; ${oversizeSkipped} übersprungen.`
      : null);
    const pickedSlot = slotRef.current;
    void gatherAttachmentFiles(
      files,
      attachActions,
      {
        continues: () =>
          aliveRef.current &&
          !(typeof document !== "undefined" && document.hidden) &&
          generation === generationRef.current &&
          pickedSlot !== null &&
          pickedSlot === slotRef.current,
        abort: () => {
          if (!noteAllowed()) return;
          setAttachNote(
            "Weitere Anhänge wurden ausgesetzt: Sitzungswechsel, Verbergen oder Abbruch.",
          );
        },
      },
      // Der Sammelabschluss räumt nur innerhalb der eigenen Batchepoch und nur,
      // wenn diese Auswahl nichts übersprungen hat; zurückgehaltene alte
      // Batches schreiben die Notiz des Neubatches nicht mehr.
      (note) => {
        if (!noteAllowed()) return;
        if (oversizeSkipped > 0 && note === null) return;
        setAttachNote(note);
      },
    );
  };
  const attachDisabledReason = !composer.available
    ? "Anhänge sind in dieser Fläche nicht verfügbar."
    : snapshot && !snapshot.writable
      ? "Diese Sitzung nimmt derzeit keine Anhänge an."
      : null;
  return {
    attachActions,
    attachAvailable,
    attachDisabledReason,
    attachNote,
    onAttachNote: setAttachNote,
    startAttachmentBatch,
  };
}
