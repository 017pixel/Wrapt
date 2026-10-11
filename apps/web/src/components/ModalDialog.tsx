import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, LoaderIcon } from "./icons";
import { useModalFocus } from "../lib/useModalFocus";

export interface ModalFrameProps {
  open: boolean;
  title: string;
  description?: string | undefined;
  className?: string | undefined;
  backdropClassName?: string | undefined;
  onClose: () => void;
  children: (requestClose: () => void) => ReactNode;
}

export function ModalFrame({ open, title, description, className, backdropClassName, onClose, children }: ModalFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const historyId = useRef(`modal-${Math.random().toString(36).slice(2)}`);
  const titleId = useId();
  const descriptionId = useId();
  closeRef.current = onClose;

  const requestClose = () => {
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.workbenchModal === historyId.current) window.history.back();
    else closeRef.current();
  };
  useModalFocus(frameRef, open, requestClose);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    window.history.pushState({ ...(window.history.state ?? {}), workbenchModal: historyId.current }, "", window.location.href);
    document.body.style.overflow = "hidden";
    const handlePopState = () => closeRef.current();
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;
  /* Über einen Portal an <body>, damit transformierte Eltern (z. B. Karten mit Hover-Transform)
     kein neues Bezugssystem für position:fixed aufspannen und der Dialog immer mittig sitzt. */
  return createPortal(
    <div className={`modal-backdrop ${backdropClassName ?? ""}`} role="presentation" onPointerDown={requestClose}>
      <div ref={frameRef} className={`modal-sheet ${className ?? ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div>
          <button type="button" className="icon-button" onClick={requestClose} aria-label="Dialog schließen"><CloseIcon className="h-5 w-5" /></button>
        </header>
        {children(requestClose)}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  className?: string;
  backdropClassName?: string;
  /** Läuft die Bestätigung noch (Mutation)? Dann ist der Knopf disabled + Spinner. */
  confirmPending?: boolean | undefined;
  /** Fehler der letzten Bestätigung: Der Dialog bleibt offen und zeigt ihn an. */
  error?: string | null | undefined;
  /**
   * Der Aufrufer schließt den Dialog selbst bei Erfolg (setX(null)) und hält
   * ihn bei Fehlern offen — ConfirmDialog schließt nicht mehr automatisch.
   * Doppelklicks werden intern verriegelt: bis zum Schließen oder
   * Pending-Wechsel löst nur der erste Klick aus.
   */
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = "Abbrechen", danger = false, className, backdropClassName, confirmPending = false, error = null, onConfirm, onClose }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef(onConfirm);
  const lockedRef = useRef(false);
  confirmRef.current = onConfirm;
  useEffect(() => { if (open) window.setTimeout(() => cancelRef.current?.focus(), 0); }, [open]);
  useEffect(() => { if (!open) lockedRef.current = false; }, [open]);
  useEffect(() => { if (confirmPending) lockedRef.current = true; }, [confirmPending]);
  return <ModalFrame open={open} title={title} description={description} className={className} backdropClassName={backdropClassName} onClose={onClose}>{(requestClose) =>
    <div className="modal-actions-column">
      {error ? <p className="modal-error" role="alert">{error}</p> : null}
      <div className="modal-actions">
        <button ref={cancelRef} type="button" className="quiet-button" onClick={requestClose}>{cancelLabel}</button>
        <button
          type="button"
          className={danger ? "quiet-button modal-danger" : "quiet-button-primary"}
          disabled={confirmPending}
          aria-busy={confirmPending || undefined}
          onClick={() => {
            if (lockedRef.current || confirmPending) return;
            // Synchron verriegeln: Zwei Klicks vor dem nächsten Render (Doppelklick)
            // lösen trotzdem nur eine Mutation aus.
            lockedRef.current = true;
            confirmRef.current();
          }}
        >{confirmPending ? <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden /> : null}{confirmLabel}</button>
      </div>
    </div>
  }</ModalFrame>;
}

export function ContentDialog({ open, title, description, onClose, children }: Omit<ModalFrameProps, "children"> & { children: ReactNode }) {
  return <ModalFrame open={open} title={title} description={description} onClose={onClose}>{(requestClose) => <>
    <div className="modal-content">{children}</div>
    <div className="modal-actions"><button type="button" className="quiet-button" onClick={requestClose} autoFocus>Schließen</button></div>
  </>}</ModalFrame>;
}

interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  initialValue: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export function PromptDialog({ open, title, description, label, initialValue, confirmLabel = "Speichern", onConfirm, onClose }: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }, [initialValue, open]);
  return <ModalFrame open={open} title={title} description={description} onClose={onClose}>{(requestClose) =>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); const next = value.trim(); if (!next) return; onConfirm(next); requestClose(); }}>
      <label>{label}<input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} maxLength={120} /></label>
      <div className="modal-actions"><button type="button" className="quiet-button" onClick={requestClose}>Abbrechen</button><button type="submit" className="quiet-button-primary" disabled={!value.trim()}>{confirmLabel}</button></div>
    </form>
  }</ModalFrame>;
}
