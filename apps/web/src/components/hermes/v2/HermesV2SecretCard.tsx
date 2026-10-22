import { useEffect, useId, useRef, useState } from "react";
import type { HermesV2Response } from "./chat-types";
import {
  REQUEST_KIND_LABEL,
  type HermesV2SecretCardProps,
} from "./request-cards";

/** Ehrliche Wirelänge des Vertrags; keine Kürzung, keine automatische Wiederholung. */
const WIRE_MAX = 65_536;

/**
 * Secret/Sudo/Vault als unkontrollierte Passwortfelder über DOM-Refs in einem
 * echten Formular (Enter sendet). Kein Wert landet in React-/Zustandstate,
 * Fehlertext oder Attributen; Submit liest den flüchtigen Wert und leert das
 * DOM synchron vor dem ersten Await.
 */
export function HermesV2SecretCard({
  request,
  blocked,
  blockedReason,
  onRespond,
}: HermesV2SecretCardProps) {
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [tooLong, setTooLong] = useState(false);
  const slug = useId();
  const isSaveLogin = request.method === "vault.save_login";

  // Erfasst die tatsächlichen DOM-Knoten beim Registrieren; spätere ref.current
  // kann beim Aufräumen schon null sein. Session-/Epochwechsel, Blocked,
  // Verstecken und Unmount leeren synchron.
  useEffect(
    function registerSecretCleanup() {
      const clearable = [identifierRef.current, passwordRef.current].filter(
        (node): node is HTMLInputElement =>
          node instanceof window.HTMLInputElement,
      );
      const clear = () =>
        clearable.forEach((node) => {
          node.value = "";
        });
      const onHide = () => {
        if (document.visibilityState === "hidden") clear();
      };
      if (document.visibilityState === "hidden") clear();
      document.addEventListener("visibilitychange", onHide);
      return () => {
        document.removeEventListener("visibilitychange", onHide);
        clear();
      };
    },
    [request.key, request.epoch, request.sessionId, blocked],
  );

  /**
   * Liest die Knoten einmal synchron, baut den ehrlichen Wirewert, leert das
   * DOM und ruft erst danach sendend auf. Nach dem Leeren nie wieder aus dem
   * DOM rekonstruieren. Überspringen sendet den belegten leeren Wirewert.
   */
  const submit = (skip: boolean) => {
    if (blocked) return;
    const identifier = identifierRef.current?.value ?? "";
    const password = passwordRef.current?.value ?? "";
    const wire = skip
      ? ""
      : isSaveLogin
        ? JSON.stringify({ identifier, password })
        : password;
    setTooLong(false);
    [identifierRef.current, passwordRef.current].forEach((node) => {
      if (node) node.value = "";
    });
    if (wire.length > WIRE_MAX) {
      setTooLong(true); // Fehlertext ohne Eingabewert, keine geheime Kürzung.
      return;
    }
    const response: HermesV2Response = { kind: "secret", value: wire };
    onRespond(response);
  };

  const formSubmit = (event: React.FormEvent) => {
    event.preventDefault(); // Immer zuerst; Werte werden synchron davor gelesen.
    submit(false);
  };

  return (
    <article
      className="hermesv2-request-card"
      aria-label={REQUEST_KIND_LABEL.secret}
    >
      <h3 className="hermesv2-request-card-title">
        {REQUEST_KIND_LABEL.secret}
      </h3>
      <p className="hermesv2-request-card-body">{request.label}</p>
      {request.hint ? (
        <p className="hermesv2-request-card-hint">{request.hint}</p>
      ) : null}
      {blocked ? (
        <p className="hermesv2-request-card-note" role="status">
          {blockedReason}
        </p>
      ) : null}
      <form className="hermesv2-secret-form" onSubmit={formSubmit}>
        {isSaveLogin ? (
          <label className="hermesv2-field" htmlFor={`${slug}-identifier`}>
            Kennung
            <input
              id={`${slug}-identifier`}
              ref={identifierRef}
              type="text"
              className="hermesv2-secret-input"
              autoComplete="username"
              spellCheck={false}
              disabled={blocked}
            />
          </label>
        ) : null}
        <label className="hermesv2-field" htmlFor={`${slug}-password`}>
          Passwort
          <input
            id={`${slug}-password`}
            ref={passwordRef}
            type="password"
            className="hermesv2-secret-input"
            autoComplete={
              request.method === "sudo" ? "current-password" : "off"
            }
            spellCheck={false}
            disabled={blocked}
          />
        </label>
        {tooLong ? (
          <p className="hermesv2-request-card-note" role="alert">
            Die Eingabe ist zu lang.
          </p>
        ) : null}
        <div className="hermesv2-request-card-actions">
          <button
            type="submit"
            className="quiet-button-primary"
            disabled={blocked}
          >
            Senden
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={blocked}
            onClick={() => submit(true)}
          >
            Überspringen
          </button>
        </div>
      </form>
    </article>
  );
}
