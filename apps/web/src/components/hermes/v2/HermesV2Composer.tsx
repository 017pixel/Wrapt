import {
  useLayoutEffect,
  useRef,
  type CompositionEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export interface HermesV2ComposerProps {
  value: string;
  onChange: (text: string) => void;
  /** Gibt die Send-Aktion zurück; ein Promise sperrt bis zum Abschluss. */
  onSubmit: () => void | Promise<void>;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
  disabledReason: string | null;
  submitting: boolean;
  /** Zusatzsperre oberhalb des Sendens, z. B. rohe Slashzeile oder unklarer Anhang. */
  sendBlockedReason?: string | null;
  /** Ein leerer Draft sendet Anhänge, sobald mindestens einer bereit ist. */
  allowEmptySubmit?: boolean;
  /** Slashpalette: listbox-Bezug und aktive Option für aria-activedescendant. */
  listId?: string | null;
  activeOptionId?: string | null;
  /** Zusätzliche Tastenlage der Palette; true = Taste konsumiert. */
  paletteKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Chips der Werkzeugleiste: Modell, Denktiefe, Freigabe. */
  chips?: ReactNode;
  /** Werkzeuge vor dem Senden: Anhänge und Überlaufmenü. */
  tools?: ReactNode;
}

/** Pfeil nach oben; die Kontur erbt die Textfarbe des Knopfes. */
function ArrowUpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="app-icon"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 19V5M5 12l7-7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Echte Textarea mit accessible name „Nachricht an Hermes“. Enter sendet,
 * Shift+Enter fügt eine Zeile ein, IME-Composition sendet nicht versehentlich.
 * Doppel-Submit wird synchron über den laufenden Send-Ref gesperrt.
 */
export function HermesV2Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  running,
  disabled,
  disabledReason,
  submitting,
  sendBlockedReason = null,
  allowEmptySubmit = false,
  listId = null,
  activeOptionId = null,
  paletteKeyDown,
  chips = null,
  tools = null,
}: HermesV2ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const submittingRef = useRef(false);

  useLayoutEffect(() => {
    if (listId) textareaRef.current?.focus();
  }, [listId]);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    if (!value) {
      // Ein langer Lade-Platzhalter darf die leere Eingabe nicht vergrößern.
      element.style.height = "auto";
      return;
    }
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [value]);

  const submit = () => {
    if (disabled || submitting || submittingRef.current) return;
    if (sendBlockedReason) return;
    if (!value.trim() && !allowEmptySubmit) return;
    // Der Senden-Knopf verschwindet bei laufender Arbeit. Der Fokus bleibt
    // deshalb im Eingabefeld, statt auf den Seitenkörper zu fallen.
    textareaRef.current?.focus({ preventScroll: true });
    submittingRef.current = true;
    try {
      const result = onSubmit();
      if (result instanceof Promise) {
        void result.then(
          () => {
            submittingRef.current = false;
          },
          () => {
            submittingRef.current = false;
          },
        );
      } else {
        submittingRef.current = false;
      }
    } catch {
      submittingRef.current = false;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      paletteKeyDown &&
      (event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Escape" ||
        (event.key === "Enter" && !event.shiftKey))
    ) {
      if (composingRef.current || event.nativeEvent.isComposing) return;
      if (paletteKeyDown(event) === true) return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    if (composingRef.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  const onComposition = (event: CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = event.type === "compositionstart";
  };

  const blocked = disabled || submitting || Boolean(sendBlockedReason);
  const blockedLabel = submitting
    ? "Senden läuft bereits"
    : (sendBlockedReason ??
      disabledReason ??
      "Senden ist derzeit nicht möglich");
  // Stop folgt dem tatsächlichen laufenden Turn; ein offenes Sendpromise sperrt
  // das Senden, nicht das Stoppen.
  const canStop = running;
  // Während der Agent arbeitet, bleibt bei leerem Feld nur Stoppen sichtbar.
  // Sobald Text oder ein fertiger Anhang da ist, erscheint Senden wieder.
  const showSend = !canStop || value.trim().length > 0 || allowEmptySubmit;

  return (
    <div className="hermesv2-composer">
      <textarea
        id="hermesv2-composer-input"
        ref={textareaRef}
        className="hermesv2-composer-input"
        value={value}
        disabled={disabled}
        placeholder="Nachricht an Hermes…"
        title={disabledReason ?? undefined}
        aria-description={disabledReason ?? undefined}
        aria-label="Nachricht an Hermes"
        aria-controls={listId ?? undefined}
        aria-activedescendant={activeOptionId ?? undefined}
        aria-expanded={listId ? activeOptionId !== null : undefined}
        rows={1}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={onComposition}
        onCompositionEnd={onComposition}
      />
      <div className="hermesv2-composer-bar">
        <div className="hermesv2-composer-left">{chips}</div>
        <div className="hermesv2-composer-tools">
          {tools}
          {canStop ? (
            <button
              type="button"
              className="quiet-button hermesv2-stop"
              aria-label="Stoppen"
              title="Laufenden Turn stoppen"
              onClick={onStop}
            >
              <span className="hermesv2-stop-glyph" aria-hidden="true" />
            </button>
          ) : null}
          {showSend ? (
            <button
              type="button"
              className="quiet-button-primary hermesv2-send"
              disabled={blocked}
              title={blocked ? blockedLabel : "Nachricht senden"}
              aria-disabled={blocked}
              aria-label={submitting ? "Senden…" : "Senden"}
              onClick={submit}
            >
              <ArrowUpIcon />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
